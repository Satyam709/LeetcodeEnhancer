import { CompaniesProblemUnlocker } from "./modules/Unlocker/CompaniesProblemUnlocker";
import { ProblemTableUnlocker } from "./modules/Unlocker/ProblemTableUnlocker";
import { TopProblemUnlocker } from "./modules/Unlocker/TopProblemUnlocker";
import { ProblemTagsUnlocker } from "./modules/Unlocker/ProblemTagsUnlocker";
import { analyticsManager } from "./modules/AnalyticsManager";
import { EditorialUnlocker } from "./modules/Unlocker/EditorialUnlocker";
import { LockedUrlsUnlocker } from "./modules/Unlocker/LockedUrlsUnlocker";

function evaluate(dataObj) {
  for (const url in dataObj) {
    if (window.location.href.includes(url)) {
      let unlockers = dataObj[url];
      for (let i = 0; i <= unlockers.length - 1; i++) {
        let unlocker = new unlockers[i]();
        try {
          unlocker.unlock();
        } catch (e) {
          analyticsManager.fireErrorEvent(url, e.message, unlocker.name);
          console.log(unlocker.name + " Error " + e);
        }
      }
      break;
    }
  }
}

function main() {
  console.log("Unlocker is running");
  let urls = {
    "https://leetcode.com/problemset": [
      ProblemTableUnlocker,
      CompaniesProblemUnlocker,
      TopProblemUnlocker,
    ],
    "https://leetcode.com/problem-list": [
      ProblemTableUnlocker,
      TopProblemUnlocker,
    ],
    "https://leetcode.com/problems": [
      ProblemTagsUnlocker,
      EditorialUnlocker,
      LockedUrlsUnlocker,
    ],
    "https://leetcode.com/study-plan": [TopProblemUnlocker],
  };
  evaluate(urls);
}

console.log("Booting up unlocker");
setTimeout(main, 500);
