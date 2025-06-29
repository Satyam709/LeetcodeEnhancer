class ProblemTableElementModifier {
  constructor() {
    this.elementModifier = [];
    this.observer = null;
    this.tableSelector = `div.mt-4.flex.flex-col.items-center.gap-4 > div.w-full.flex-1 > div`;
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
    return document.querySelector(this.tableSelector) == null;
  }

  getTable() {
    if (this.isTableLoading()) {
      return null;
    }
    let table = document.querySelector(this.tableSelector);
    return table;
  }

  getProblemSets() {
    let table = this.getTable();
    if (table == null) {
      return [];
    }
    let problemsets = table.childNodes;
    // child node example:
    // <a
    //   href="/problems/diagonal-traverse"
    //   class="group flex flex-col rounded-[8px] duration-300 bg-fill-quaternary dark:bg-fill-quaternary"
    //   id="498"
    //   target="_self"
    // >
    //   <div class="flex h-[44px] w-full items-center space-x-3 px-4">
    //     <div>
    //       <div>
    //         <div class="h-4 w-4"></div>
    //         <div class="flex items-center" data-state="closed"></div>
    //       </div>
    //     </div>
    //     <div class="relative flex h-full w-full cursor-pointer items-center">
    //       <div class=" flex w-0 flex-1 items-center space-x-2">
    //         <div class="text-body text-sd-foreground max-w-full font-medium">
    //           <div class="ellipsis line-clamp-1">498. Diagonal Traverse</div>
    //         </div>
    //       </div>
    //       <div
    //         class="text-sd-muted-foreground flex w-[70px] items-center justify-center text-sm opacity-0 group-hover:opacity-100 lc-md:opacity-100"
    //         data-state="closed"
    //       >
    //         63.2%
    //       </div>
    //       <p class="mx-0 text-[14px] text-sd-medium lc-xl:mx-4">Med.</p>
    //     </div>
    //     <div data-state="closed">
    //       <div class="flex gap-0.5 px-1">
    //         <div class="h-2 w-0.5 rounded bg-sd-foreground opacity-20"></div>
    //         <div class="h-2 w-0.5 rounded bg-sd-foreground opacity-20"></div>
    //         <div class="h-2 w-0.5 rounded bg-sd-foreground opacity-20"></div>
    //         <div class="h-2 w-0.5 rounded bg-sd-foreground opacity-20"></div>
    //         <div class="h-2 w-0.5 rounded bg-sd-foreground opacity-20"></div>
    //         <div class="h-2 w-0.5 rounded bg-sd-foreground opacity-20"></div>
    //         <div class="h-2 w-0.5 rounded bg-sd-foreground opacity-20"></div>
    //         <div class="h-2 w-0.5 rounded bg-sd-foreground opacity-20"></div>
    //       </div>
    //     </div>
    //     <div class="flex items-center">
    //       <div
    //         class="hover:bg-sd-accent flex h-7 w-7 cursor-pointer items-center justify-center rounded opacity-0 group-hover:opacity-100"
    //         type="button"
    //         aria-haspopup="dialog"
    //         aria-expanded="false"
    //         aria-controls="radix-:r23i:"
    //         data-state="closed"
    //       >
    //         <div class="relative text-[14px] leading-[normal] p-[1px] before:block before:h-3.5 before:w-3.5 text-sd-muted-foreground">
    //           <svg
    //             aria-hidden="true"
    //             focusable="false"
    //             data-prefix="far"
    //             data-icon="star"
    //             class="svg-inline--fa fa-star absolute left-1/2 top-1/2 h-[1em] -translate-x-1/2 -translate-y-1/2 align-[-0.125em]"
    //             role="img"
    //             xmlns="http://www.w3.org/2000/svg"
    //             viewBox="0 0 576 512"
    //           >
    //             <path
    //               fill="currentColor"
    //               d="M287.9 0c9.2 0 17.6 5.2 21.6 13.5l68.6 141.3 153.2 22.6c9 1.3 16.5 7.6 19.3 16.3s.5 18.1-5.9 24.5L433.6 328.4l26.2 155.6c1.5 9-2.2 18.1-9.6 23.5s-17.3 6-25.3 1.7l-137-73.2L151 509.1c-8.1 4.3-17.9 3.7-25.3-1.7s-11.2-14.5-9.7-23.5l26.2-155.6L31.1 218.2c-6.5-6.4-8.7-15.9-5.9-24.5s10.3-14.9 19.3-16.3l153.2-22.6L266.3 13.5C270.4 5.2 278.7 0 287.9 0zm0 79L235.4 187.2c-3.5 7.1-10.2 12.1-18.1 13.3L99 217.9 184.9 303c5.5 5.5 8.1 13.3 6.8 21L171.4 443.7l105.2-56.2c7.1-3.8 15.6-3.8 22.6 0l105.2 56.2L384.2 324.1c-1.3-7.7 1.2-15.5 6.8-21l85.9-85.1L358.6 200.5c-7.8-1.2-14.6-6.1-18.1-13.3L287.9 79z"
    //             ></path>
    //           </svg>
    //         </div>
    //       </div>
    //     </div>
    //   </div>
    // </a>;
    return problemsets;
  }

  getProblemId(problemName) {
    if (problemName == "") {
      return "";
    }
    return problemName.split(".")[0];
  }

  getProblemName(childNode) {
    if (childNode == null) {
      return "";
    }
    return childNode.querySelector(
      "div.text-body.text-sd-foreground.max-w-full.font-medium > div.ellipsis.line-clamp-1"
    )?.textContent || "";
  }

  getIsPremium(childNode) {
    if (childNode == null) {
      return false;
    }
    let selector = `[data-icon="lock"]`;
    return childNode.querySelector(selector) != null;
  }

  modifyActiveElement = () => {
    if (this.isTableLoading() || this.getProblemSets().length == 0) {
      console.log("table is loading, waiting for 100ms");
      window.setTimeout(() => {
        this.modifyActiveElement.bind(this)();
      }, 100);
      return;
    }
    
    this.disconnectObserverToProblemTable();
    let problemsets = this.getProblemSets();

    console.log("problemsets", problemsets);
    

    problemsets.forEach(problemset => {
      let problemName = this.getProblemName(problemset);
      let id = this.getProblemId(problemName);
      console.log(problemName, id);
      problemset.setAttribute("problem-id", String(id));
      let isPremium = this.getIsPremium(problemset);
      problemset.setAttribute("is-premium", isPremium);
      this.elementModifier.forEach(modifier => {
        modifier(problemset);
      });
    });
    this.addObserverToProblemTable();
  };

  disconnectObserverToProblemTable() {
    this.observer.disconnect();
  }

  addObserverToProblemTable() {
    let table = this.getTable();

    if (!table) {
      console.log("table is null, waiting for 100ms");
      window.setTimeout(() => {
        this.addObserverToProblemTable.bind(this)();
      }, 100);
      return;
    }

    var config = { childList: true, subtree: true };
    this.observer.observe(table, config);
  }
}
export { ProblemTableElementModifier };
