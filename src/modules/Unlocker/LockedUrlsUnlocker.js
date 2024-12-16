import { LocalStorageEditorialDataFetcher } from "../DataFetcher/LocalStorageDataFetcher";
import { EditorialPageElementModifier } from "../ElementModifier/EditorialPageElementModifier";
import { modalManager } from "../ContainerManager";
import { EditorialContentBuilder } from "../ContentBuilder/EditorialContentBuilder";
import { GoogleSheetsEditorialDataFetcher } from "../DataFetcher/GoogleSheetsDataFetcher";
import { ProblemTagsUnlocker } from "./ProblemTagsUnlocker";
class LockedUrlsUnlocker {
  constructor() {
    this.name = "LockedUrlsUnlocker";
    this.elementModifier = new EditorialPageElementModifier();
    this.dataFetcher = new LocalStorageEditorialDataFetcher();
    this.containerManager = modalManager;
    this.problemTags = new ProblemTagsUnlocker();
  }
  async fetchData() {
    this.data = await GoogleSheetsEditorialDataFetcher.fetchAllDetailsByUrl(
      LockedUrlsUnlocker.getUrl()
    );
  }

  static isUrlLocked() {
    return document.querySelector(".z-overlay") != null;
  }

  static getUrl() {
    const url = document.URL;
    let count = 0;
    let index;
    for (index = 0; index < url.length; index++) {
      if (url.charAt(index) == "/") {
        count++;
      }
      if (count == 5) {
        break;
      }
    }
    let problemUrl = url.substring(0, index + 1);
    return problemUrl;
  }

  async unlock() {
    if (!LockedUrlsUnlocker.isUrlLocked()) {
      return;
    }
    await this.fetchData();

    if (!this.data) {
      return;
    }

    let overlayDiv = document.querySelector(".z-overlay");
    // clear child nodes
    while (overlayDiv.firstChild) {
      overlayDiv.removeChild(overlayDiv.firstChild);
    }
    // add problem statement and editorial buttons
    let problemStatementButton =
      LockedUrlsUnlocker.createStyledButton("View Description");
    let editorialButton =
      LockedUrlsUnlocker.createStyledButton("View Editorial");

    // add a div to display newly created problem title and difficulty tag,company tag
    let titleDiv = document.createElement("div");
    titleDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 20px;
    `;

    let title = document.createElement("h1");
    title.innerText = this.data[3];
    title.style.cssText = `
      font-size: 24px;
      font-weight: 600;
      color: #ffffff;
    `;
    let tags = document.createElement("div");
    let difficulty = document.createElement("span");
    difficulty.innerText = this.data[6];
    difficulty.style.cssText = `
      font-size: 14px;
      font-weight: 500;
      color: #24292f;
      background-color: #f3f4f6;
      border: 1px solid #d0d7de;
      padding: 2px 6px;
      border-radius: 6px;
      margin-right: 10px;
    `;

    // set flex direction to column for overlayDiv
    overlayDiv.style.flexDirection = "column";

    let company = document.createElement("span");
    company.innerText = "Companies";
    company.style.cssText = difficulty.style.cssText;
    // mouse pointer
    company.style.cursor = "pointer";

    tags.appendChild(difficulty);
    tags.appendChild(company);

    // add onclick event to companies tag
    company.addEventListener("click", () => {
      this.problemTags.onTagButtonClicked();
    });

    titleDiv.appendChild(title);
    titleDiv.appendChild(tags);

    overlayDiv.appendChild(titleDiv);
    // add a div to hold the buttons
    let buttonDiv = document.createElement("div");
    buttonDiv.style.cssText = `
      display: flex;
      justify-content: space-around;
      margin-top: 20px;
    `;

    buttonDiv.appendChild(problemStatementButton);
    buttonDiv.appendChild(editorialButton);
    overlayDiv.appendChild(buttonDiv);

    // add event listeners to the buttons
    problemStatementButton.addEventListener("click", () => {
      this.onDescriptionTabClicked();
    });

    editorialButton.addEventListener("click", () => {
      this.onEditorialTabClicked();
    });
  }

  onEditorialTabClicked = () => {
    let problemUrl = LockedUrlsUnlocker.getUrl();

    if (problemUrl == undefined) return;
    this.containerManager.clearModalContent();
    this.containerManager.openModal();
    this.containerManager.showLoadingIcon();
    this.onDataFetched(this.data[11]);
  };

  onDescriptionTabClicked = () => {
    let problemUrl = LockedUrlsUnlocker.getUrl();

    if (problemUrl == undefined) return;
    this.containerManager.clearModalContent();
    this.containerManager.openModal();
    this.containerManager.showLoadingIcon();
    this.onDataFetched(this.data[10]);
  };

  onDataFetched(innerHtml) {
    let builder = new EditorialContentBuilder();
    builder.buildRateUsText();
    builder.buildContent(innerHtml);
    let targetParent = this.containerManager.getModalContentBox();
    this.containerManager.clearModalContent();
    targetParent.appendChild(builder.getResult());
  }

  static createStyledButton(text) {
    // Create the button element
    const button = document.createElement("button");

    // Set the button's text
    button.innerText = text;

    // Apply styles as a single string
    button.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 6px 12px;
    font-size: 14px;
    font-weight: 500;
    color: #24292f;
    background-color: #f3f4f6;
    border: 1px solid #d0d7de;
    margin: 0 16px 0 16px;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.2s background-color 0.2s, border-color 0.2s;
    box-shadow: 0 1px 2px rgba(27, 31, 35, 0.1);

  `;

    // Add hover effect
    button.addEventListener("mouseover", () => {
      button.style.backgroundColor = "#eaeef2";
      button.style.borderColor = "#d8dee4";
      button.style.opacity = "0.7";
    });

    button.addEventListener("mouseout", () => {
      button.style.backgroundColor = "#f3f4f6";
      button.style.borderColor = "#d0d7de";
      button.style.opacity = "1";
    });

    // Add active effect
    button.addEventListener("mousedown", () => {
      button.style.backgroundColor = "#d0d7de";
      button.style.borderColor = "#c1c7cd";
    });

    button.addEventListener("mouseup", () => {
      button.style.backgroundColor = "#eaeef2";
      button.style.borderColor = "#d8dee4";
    });

    // Add focus effect
    button.addEventListener("focus", () => {
      button.style.outline = "2px solid #0969da";
      button.style.outlineOffset = "2px";
    });

    button.addEventListener("blur", () => {
      button.style.outline = "none";
    });

    // Return the generated button
    return button;
  }
}

export { LockedUrlsUnlocker };
