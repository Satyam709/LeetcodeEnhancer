import { LocalStorageEditorialDataFetcher } from "../DataFetcher/LocalStorageDataFetcher";
import { EditorialPageElementModifier } from "../ElementModifier/EditorialPageElementModifier";
import { modalManager } from "../ContainerManager";
import { EditorialContentBuilder } from "../ContentBuilder/EditorialContentBuilder";
import { GoogleSheetsEditorialDataFetcher } from "../DataFetcher/GoogleSheetsDataFetcher";
class EditorialUnlocker {
  constructor() {
    this.name = "EditorialUnlocker";
    this.elementModifier = new EditorialPageElementModifier();
    this.dataFetcher = new LocalStorageEditorialDataFetcher();
    this.containerManager = modalManager;
  }

  async unlock() {
    const name = document.URL.split("/")[4];
    const out = await this.elementModifier.isEditorialLockedRequest(name);
    if (!out)
      return;
    this.elementModifier.injectFunctionToTargetElement(
      this.onEditorialTabClicked
    );
    this.elementModifier.modifyElement();
  }

  onEditorialTabClicked = (button) => {
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
    let problemUrl = url.substring(0, index+1);

    console.log("modified url ", problemUrl);

    if (problemUrl == undefined) return;
    this.containerManager.clearModalContent();
    this.containerManager.openModal();
    this.containerManager.showLoadingIcon();
    console.log("fetching data for 204");
    //this.dataFetcher.fetchData("204").then((data) => this.onDataFetched(data)); using url fetcher instead
    GoogleSheetsEditorialDataFetcher.fetchEditorialDataByUrl(problemUrl).then(
      (data) => this.onDataFetched(data)
    );
  };

  onDataFetched(innerHtml) {
    let builder = new EditorialContentBuilder();
    builder.buildRateUsText();
    builder.buildContent(innerHtml);
    let targetParent = this.containerManager.getModalContentBox();
    this.containerManager.clearModalContent();
    targetParent.appendChild(builder.getResult());
  }
}

export { EditorialUnlocker };
