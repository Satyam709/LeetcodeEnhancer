class ProblemTableElementModifier {
  constructor() {
    this.elementModifier = [];
    this.observer = null;
  }

  modifyElement() {
    this.observer = new MutationObserver(() => {
      this.modifyActiveElement();
    });
    this.modifyActiveElement();
    this.addObserverToProblemTable();
  }

  injectFunctionToTargetElement(func) {
    this.elementModifier.push(func);
  }

  isTableLoading() {
    let table = document.querySelectorAll('div[role="rowgroup"]')[2];

    let problemsets = table.querySelectorAll('div[role="row"]');

    return (
      problemsets[0].querySelectorAll('[role="cell"]')[1].textContent == ""
    );
  }

  getTable() {
    if (this.isTableLoading()) {
      return null;
    }
    let table = document.querySelectorAll('div[role="rowgroup"]')[2];
    return table;
  }
  
  getProblemSets() {
    if (this.isTableLoading()) {
      return [];
    }
    let table = this.getTable();
    let problemsets = table.querySelectorAll('div[role="row"]');
    return problemsets;
  }

  modifyActiveElement = () => {
    if (this.isTableLoading()) {
        console.log("table is loading, waiting for 100ms");
      window.setTimeout(() => {
        this.modifyActiveElement.bind(this)();
      }, 100);
      return;
    }
    this.disconnectObserverToProblemTable();
    let table = this.getTable();
    let problemsets =  this.getProblemSets();
    
    for (let i = 0; i <= problemsets.length - 1; i++) {

      let cells = problemsets[i].querySelectorAll('[role="cell"]');
      let problemName = cells[1].textContent;
      let id = problemName.split(".")[0];
      problemsets[i].setAttribute("problem-id", String(id));
      let isPremium = problemsets[i].getElementsByTagName("rect").length > 0;
      problemsets[i].setAttribute("is-premium", isPremium);
      for (let ii = 0; ii <= this.elementModifier.length - 1; ii++) {
        this.elementModifier[ii](problemsets[i]);
      }
    }
    this.addObserverToProblemTable();
  };

  disconnectObserverToProblemTable() {
    this.observer.disconnect();
  }

  addObserverToProblemTable() {
    let table = this.getTable();

    if (!table) {
      console.log("table is null, waiting for 3000ms");
      window.setTimeout(() => {
        this.addObserverToProblemTable.bind(this)();
      }, 3000);
      return;
    }
    
    console.log("obseving table ");
    var config = { childList: true, subtree: true };
    this.observer.observe(table, config);
  }
}
export { ProblemTableElementModifier };
