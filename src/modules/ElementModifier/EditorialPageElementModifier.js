import { CSSStyler } from "../Objects";
import { ProblemTagsElementModifier } from "./ProblemTagsElementModifier";
class EditorialPageElementModifier {
  constructor() {
    this.elementModifier = [];
    this.checkCount = 0;
  }

  injectFunctionToTargetElement(func) {
    this.elementModifier.push(func);
  }

  addEditorialButton() {
    const obj = new ProblemTagsElementModifier();
    let descriptionTab = obj.getDescrptionTab();
    let companiesButton = obj.getCompaniesButton();
    if (!companiesButton) {
      window.setTimeout(() => {
        this.addEditorialButton();
      }, 100);
      return;
    }
    let editorialButton = companiesButton.cloneNode(true);
    editorialButton.innerHTML = `<svg
    aria-hidden="true"
    focusable="false"
    data-prefix="far"
    data-icon="book-open"
    class="svg-inline--fa fa-book-open"
    role="img"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 576 512"
    style="width: 1rem; height: 1rem; color:orange;" <!-- Optional size -->
  >
    <path
      fill="currentColor"
      d="M156 32C100.6 32 48.8 46.6 27.1 53.6C10.3 59 0 74.5 0 91.1V403.5c0 26.1 24 44.2 48 40.2c19.8-3.3 54.8-7.7 100-7.7c54 0 97.5 25.5 112.5 35.6c7.5 5 16.8 8.4 27 8.4c11.5 0 21.6-4.2 29.3-9.9C330.2 460.3 369.1 436 428 436c47.7 0 80.5 4 99 7.2c23.9 4.1 49-13.8 49-40.6V91.1c0-16.5-10.3-32.1-27.1-37.5C527.2 46.6 475.4 32 420 32c-36.8 0-71.8 6.4-97.4 12.7c-12.8 3.2-23.5 6.3-30.9 8.7c-1.3 .4-2.6 .8-3.7 1.2c-1.1-.4-2.4-.8-3.7-1.2c-7.5-2.4-18.1-5.5-30.9-8.7C227.8 38.4 192.8 32 156 32zM264 97.3V417.9C238 404.2 196.8 388 148 388c-42.9 0-77.4 3.7-100 7.1V97.3C70.3 90.6 112.4 80 156 80c31.6 0 62.6 5.6 85.9 11.3c8.6 2.1 16.1 4.2 22.1 6zm48 319.2V97.3c6-1.8 13.5-3.9 22.1-6C357.4 85.6 388.4 80 420 80c43.6 0 85.7 10.6 108 17.3V394.7c-21.7-3.3-54.9-6.7-100-6.7c-51.4 0-90.8 15-116 28.6z"
    ></path>
  </svg>
  Editorial`;
    editorialButton.style.backgroundColor = CSSStyler.COLOR_ACCENT;
    editorialButton.style.color = "black";
    companiesButton.parentElement.appendChild(editorialButton);
    this.addEventListenerToEditorialButton(editorialButton);
  }

  modifyElement() {
    this.removeEditorialTab();
    this.addEditorialButton();
  }

  addEventListenerToEditorialButton(editorialButton) {
    let button = editorialButton;

    if (!button) {
      return;
    }
    button.addEventListener("click", (event) => {
      for (let iii = 0; iii <= this.elementModifier.length - 1; iii++) {
        this.elementModifier[iii](button);
      }
      if (button.getAttribute("problem-id") != undefined)
        event.stopImmediatePropagation();
    });
  }

  isEditorialLocked() {
    let tabPath = document
      .querySelector("#editorial_tab")
      .parentNode.parentNode.getAttribute("data-layout-path");

    tabPath = tabPath.replace("b", "");

    const tab = document.querySelector(
      `div[data-layout-path="${tabPath}"] .bg-blocker`
    );

    return tab != null;
  }

  async isEditorialLockedRequest(slug) {
    try {
      let res = await fetch("https://leetcode.com/graphql/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query:
            "\n    query ugcArticleOfficialSolutionArticle($questionSlug: String!) {\n  ugcArticleOfficialSolutionArticle(questionSlug: $questionSlug) {\n    ...ugcSolutionArticleFragment\n    isArticleReviewer\n    scoreInfo {\n      scoreCoefficient\n    }\n  }\n  question(titleSlug: $questionSlug) {\n    solution {\n      content\n    }\n  }\n}\n    \n    fragment ugcSolutionArticleFragment on SolutionArticleNode {\n  uuid\n  title\n  slug\n  summary\n  author {\n    realName\n    userAvatar\n    userSlug\n    userName\n    nameColor\n    activeBadge {\n      icon\n      displayName\n    }\n  }\n  articleType\n  thumbnail\n  summary\n  createdAt\n  updatedAt\n  status\n  isLeetcode\n  canSee\n  canEdit\n  isMyFavorite\n  chargeType\n  myReactionType\n  topicId\n  hitCount\n  hasVideoArticle\n  reactions {\n    count\n    reactionType\n  }\n  title\n  slug\n  tags {\n    name\n    slug\n    tagType\n  }\n  topic {\n    id\n    topLevelCommentCount\n  }\n}\n    ",
          variables: { questionSlug: slug },
          operationName: "ugcArticleOfficialSolutionArticle",
        }),
      });

      let data = await res.json();

      // console.log(JSON.stringify(data));

      if (data.data.question.solution.content == null) {
        return true;
      }
      return false;
    } catch (e) {
      console.log("cannot fetch editorial data", e);
      return true;
    }
  }

  removeEditorialTab() {
    const tab = document.querySelector("#editorial_tab").parentNode.parentNode;
    tab.remove();
  }
}

export { EditorialPageElementModifier };
