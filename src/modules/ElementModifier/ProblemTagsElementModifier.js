import { CSSStyler } from "../Objects";

class ProblemTagsElementModifier {
  constructor() {
    console.log("ProblemTagsElementModifier created");

    this.tagButtonListener = [];
  }

  getTabMenu() {
    let tabMenu = document.getElementsByClassName("gap-8")[0];
    if (tabMenu == undefined)
      tabMenu = document.getElementsByClassName("gap-6")[0];
    return tabMenu;
  }

  isCompaniesButtonGot() {
    let companiesButton = this.getCompaniesButton();
    return companiesButton != undefined;
  }

  modifyElement() {
    let isActive = this.isCompaniesButtonGot();
    if (!isActive) {
      window.setTimeout(() => {
        this.modifyElement();
      }, 100);
      return;
    }
    let path = this.getDataPath();
    console.log("path in modify element", path);
    this.modifyCompaniesTagButton();
  }

  addObserverToLeftTab() {
    let tabElement = this.getTabMenu();
    if (tabElement == undefined) {
      window.setTimeout(() => {
        this.addObserverToLeftTab();
      }, 100);
      return;
    }
    let config = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    };
    let observer = new MutationObserver(() => {
      if (this.isDescriptionTabActive()) this.modifyCompaniesTagButton();
    });
    observer.observe(tabElement, config);
  }

  // isDescriptionTabActive() {
  //     return this.getTabMenu().children[0].children[0].childElementCount == 2
  // }

  getDescrptionTab() {
    let descriptionTab = document.querySelector("#description_tab");
    console.log(descriptionTab);

    if (descriptionTab == undefined) {
      window.setTimeout(() => {
        this.getDescrptionTab();
      }, 100);
      return;
    }
    return descriptionTab;
  }

  getDataPath() {
    let descriptionTab = this.getDescrptionTab();
    let parent = this.getDescrptionTabParent();
    // fix path
    let path = parent.getAttribute("data-layout-path");
    path = path.replace("b", "");
    return path;
  }

  getDescrptionTabParent() {
    let descriptionTab = this.getDescrptionTab();
    console.log(descriptionTab);

    let parent = descriptionTab.parentNode.parentNode;

    if (!parent) {
      console.log("parent is undefined, waiting for 100ms");

      window.setTimeout(() => {
        this.getDescrptionTab();
      }, 100);

      return undefined;
    }
    return parent;
  }

  getDescrptionTabContent() {
    let path = this.getDataPath();
    let content = document.querySelector(`div[data-layout-path="${path}"]`);
    console.log("found content", content);
    return content;
  }

  getCompaniesButton() {
    let content = this.getDescrptionTabContent();
    let companiesButton = content.querySelectorAll(
      "div.flex.gap-1 div.py-1"
    )[2];
    return companiesButton;
  }

  isDescriptionTabActive() {
    console.log("checking if description tab is active");
    let descriptionTab = this.getDescrptionTab();
    let parent = this.getDescrptionTabParent();
    console.log("parent in isDescriptionTabActive", parent);

    if (descriptionTab == undefined) return false;

    if (parent == undefined) return false;
    let isActive = parent.classList.contains(
      "flexlayout__tab_button--selected"
    );
    console.log("description tab is active", isActive);
    return isActive;
  }

  modifyCompaniesTagButton() {
    let tagButton = this.getCompaniesButton();
    let lockicon = tagButton.getElementsByTagName("svg")[0];
    if (lockicon == undefined) return;
    let tagDiv = lockicon.parentElement;
    lockicon.remove();
    let newNode = tagDiv.cloneNode(true);
    tagDiv.parentElement.replaceChild(newNode, tagDiv);
    newNode.style.backgroundColor = CSSStyler.COLOR_ACCENT;
    newNode.style.color = "black";

    let content = this.getDescrptionTabContent();
    let a = content.querySelectorAll(
      '.mt-6.flex.flex-col.gap-3 div[class="flex flex-col"]'
    )[1];

    // make svg invisible
    let svg = a.querySelectorAll("svg")[0];
    svg.style.visibility = "hidden";

    svg.parentElement.style.color = CSSStyler.COLOR_ACCENT;

    let newNode2 = a.cloneNode(true);
    a.parentElement.replaceChild(newNode2, a);

    for (let i = 0; i <= this.tagButtonListener.length - 1; i++) {
      newNode.addEventListener("click", this.tagButtonListener[i]);
      newNode2.addEventListener("click", this.tagButtonListener[i]);
    }
  }

  addTagButtonOnClickListener(func) {
    this.tagButtonListener.push(func);
  }
}

export { ProblemTagsElementModifier };
