import { ProblemTableElementModifier } from "../ElementModifier/ProblemTableElementModifier";
import {
  generateInnerProgressbar,
  generateRedInnerProgressBar,
} from "../ElementGenerator/ElementHelperClass";
import { GoogleSheetsProblemTableDataFetcher } from "../DataFetcher/GoogleSheetsDataFetcher";
import { CSSStyler } from "../Objects";
import { modalManager } from "../ContainerManager";
import DOMPurify from "dompurify";
import { LocalStorageFrequencyDataFetcher } from "../DataFetcher/LocalStorageDataFetcher";
import { analyticsManager } from "../AnalyticsManager";

class ProblemTableUnlocker {
  constructor() {
    this.elementModifier = new ProblemTableElementModifier();
    this.dataFetcher = new LocalStorageFrequencyDataFetcher();
    this.containerManager = modalManager;
    this.isFetching = false;
    this.premiumProblemButtonId = 2;
    this.analyticsManager = analyticsManager;
    this.name = "ProblemTableUnlocker";
  }

  onFetchSuccess() {
    this.elementModifier.injectFunctionToTargetElement(
      this.insertInnerProgressbar
    );
    this.elementModifier.injectFunctionToTargetElement(
      this.modifyPremiumProblemHref
    );
    this.elementModifier.modifyElement();
  }

  modifyPremiumProblemHref = (row) => {
    let isPremium = row.getAttribute("is-premium") == "true"; // to modify
    if (isPremium) {
      this.removePremiumIcons(row);
      // remove all event listeners by cloning the row
      let clonedRow = row.cloneNode(true);
      row.parentNode.replaceChild(clonedRow, row);
      row = clonedRow;
      let problemId = row.getAttribute("problem-id");
      row.setAttribute("href", "javascript:void(0)");
      row.style.color = CSSStyler.COLOR_ACCENT;
      row.addEventListener("click", () => {
        this.onPremiumProblemClicked(problemId);
      });
    }
  };

  unlock() {
    console.log("ProblemTableUnlocker.unlock");
    this.dataFetcher
      .fetchData()
      .then((data) => {
        this.problemData = data;
      })
      .then(this.onFetchSuccess.bind(this))
      .then(this.analyticsManager.fireUnlockedDataEvent(this.name))
      .catch((e) => console.log(this, e));
  }

  onPremiumProblemClicked = (problemId) => {
    if (this.isFetching) return;
    this.analyticsManager.fireModifiedButtonClickedEvent(
      this.premiumProblemButtonId,
      "PremiumProblem",
      problemId
    );
    this.isFetching = true;
    this.containerManager.clearModalContent();
    this.containerManager.openModal();
    this.containerManager.showLoadingIcon();
    this.dataFetcher
      .fetchPremiumProblem(parseInt(problemId))
      .then((data) => this.onProblemFetchSuccess(data))
      .then((this.isFetching = false));
  };

  onProblemFetchSuccess(data) {
    let targetParent = this.containerManager.getModalContentBox();
    this.containerManager.clearModalContent();
    let htmlString = String(data).replaceAll("<strong>", "<br><strong>");
    targetParent.innerHTML = DOMPurify.sanitize(htmlString);
    let pres = targetParent.getElementsByTagName("pre");
    for (let i = 0; i <= pres.length - 1; i++) {
      pres[i].style = `
            border-radius: 0.5rem;
            font-family: Menlo,sans-serif;
            font-size: .875rem;
            line-height: 1.25rem;
            margin-bottom: 1rem;
            margin-top: 1rem;
            padding: 1rem;
    `;
    }
  }

  removePremiumIcons(row) {
    let lockLogo = this.getPremiumIcon(row);
    if (lockLogo != undefined) lockLogo.style.opacity = 0;
  }

  getPremiumIcon(row) {
    let selector = `[data-icon="lock"]`;
    return row.querySelector(selector);
  }

  insertInnerProgressbar = (row) => {
    let parentDiv = row.querySelector(
      `div[class*='flex h-[44px] w-full items-center space-x-3 px-4']`
    );

    if (parentDiv == null) {
      console.log("parentDiv is null");
      return;
    }

    if (parentDiv.getAttribute("progress-bar-added") == "true") return;

    parentDiv.childNodes[2]?.remove();
    parentDiv.childNodes[3]?.remove();

    let id = row.getAttribute("problem-id");

    let width = this.problemData[id];

    if (width == undefined) width = 100;
    width *= 100;

    let outerProgressbar = document.createElement("div");
    outerProgressbar.classList.add("rounded-l-lg");
    outerProgressbar.style = `
      width: 90px;
      height: 10px;
      border-bottom-right-radius: 0.5rem;
      border-top-right-radius: 0.5rem;
      border-bottom-left-radius: 0.5rem;
      border-top-left-radius: 0.5rem;
    `;

    let progress;

    if (id in this.problemData) {
      progress = generateInnerProgressbar(width);
      outerProgressbar.setAttribute("title", `${Math.round(width)}%`);
    } else {
      progress = generateRedInnerProgressBar(width);
      outerProgressbar.setAttribute("title", `No Data`);
    }
    outerProgressbar.appendChild(progress);

    parentDiv.appendChild(outerProgressbar);

    parentDiv.setAttribute("progress-bar-added", "true");
  };
}

export { ProblemTableUnlocker };
