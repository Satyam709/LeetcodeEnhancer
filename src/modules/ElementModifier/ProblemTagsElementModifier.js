import { CSSStyler } from "../Objects";

class ProblemTagsElementModifier {
  constructor() {
    this.tagButtonListener = [];
  }

  isCompaniesButtonGot() {
    return this.getCompaniesButton();
  }

  modifyElement() {
    try {
      if (!this.isCompaniesButtonGot()) {
        window.setTimeout(() => {
          this.modifyElement();
        }, 100);
        return;
      }
      this.modifyCompaniesTagButton();
    } catch (e) {
      console.log(e, " error occured\n retrying in 100ms");
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
    if (parent == null) return null;
    let path = parent.getAttribute("data-layout-path");
    path = path.replace("b", "");
    return path;
  }

  getDescrptionTabParent() {
    let descriptionTab = this.getDescrptionTab();
    if (descriptionTab == null) return null;
    let parent = descriptionTab.parentNode?.parentNode;
    return parent;
  }

  getDescrptionTabContent() {
    let path = this.getDataPath();
    if (path == null) return null;
    let content = document.querySelector(`div[data-layout-path="${path}"]`);
    return content;
  }

  getCompaniesButton() {
    let content = this.getDescrptionTabContent();
    if (content == null) return null;
    let companiesButton = content.querySelectorAll(
      "div.flex.gap-1 div.py-1"
    )?.[2];
    return companiesButton;
  }

  modifyCompaniesTagButton() {
    let tagButton = this.getCompaniesButton();
    let newNode = tagButton.cloneNode(true);
    tagButton.parentElement.replaceChild(newNode, tagButton);
    newNode.childNodes[0]?.remove();
    newNode.style.backgroundColor = CSSStyler.COLOR_ACCENT;
    newNode.style.color = "black";
    newNode.childNodes[0].style.color = "black";

    let content = this.getDescrptionTabContent();

    let topParent = content.querySelectorAll(
      '.mt-6.flex.flex-col.gap-3 div[class="flex flex-col"]'
    )[1];

    // clone topParent
    let topParentClone = topParent.cloneNode(true);

    topParent.parentElement.replaceChild(topParentClone, topParent);

    let a = topParentClone?.childNodes[0]?.childNodes[0]?.childNodes[0];

    // make svg invisible
    a.childNodes[0].style.visibility = "hidden";
    a.childNodes[1].style.color = CSSStyler.COLOR_ACCENT;

    for (let i = 0; i <= this.tagButtonListener.length - 1; i++) {
      newNode.addEventListener("click", this.tagButtonListener[i]);
      a.addEventListener("click", this.tagButtonListener[i]);
    }
  }

  addTagButtonOnClickListener(func) {
    this.tagButtonListener.push(func);
  }
}

export { ProblemTagsElementModifier };
