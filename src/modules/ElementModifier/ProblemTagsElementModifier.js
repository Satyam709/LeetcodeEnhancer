import { CSSStyler } from "../Objects";

class ProblemTagsElementModifier {
  constructor() {
    this.tagButtonListener = [];
  }

  isCompaniesButtonGot() {
    let companiesButton = this.getCompaniesButton();
    return companiesButton != undefined;
  }

  modifyElement() {
    try {
      let isActive = this.isCompaniesButtonGot();
      if (!isActive) {
        window.setTimeout(() => {
          this.modifyElement();
        }, 100);
        return;
      }
      let path = this.getDataPath();
      this.modifyCompaniesTagButton();
    } catch (e) {
        console.log(e," error occured\n retrying in 100ms");
        window.setTimeout(() => {
            this.modifyElement();
        }, 100);
    }
  }

  getDescrptionTab() {
    let descriptionTab = document.querySelector("#description_tab");
    return descriptionTab;
  }

  getDataPath() {
    let parent = this.getDescrptionTabParent();
    // fix path
    let path = parent.getAttribute("data-layout-path");
    path = path.replace("b", "");
    return path;
  }

  getDescrptionTabParent() {
    let descriptionTab = this.getDescrptionTab();
    let parent = descriptionTab.parentNode.parentNode;
    return parent;
  }

  getDescrptionTabContent() {
    let path = this.getDataPath();
    let content = document.querySelector(`div[data-layout-path="${path}"]`);
    return content;
  }

  getCompaniesButton() {
    let content = this.getDescrptionTabContent();
    let companiesButton = content.querySelectorAll(
      "div.flex.gap-1 div.py-1"
    )[2];
    return companiesButton;
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
