class ProblemInfo {
  constructor(frequency, id, difficulty, problemUrl, problemName, acceptance) {
    this.frequency = frequency;
    this.id = id;
    this.difficulty = difficulty;
    this.problemUrl = problemUrl;
    this.problemName = problemName;
    this.acceptance = acceptance;
  }
}

class CompanyProblemInfo extends ProblemInfo {
  constructor(
    frequency,
    id,
    difficulty,
    problemUrl,
    problemName,
    acceptance,
    companyName,
    duration
  ) {
    super(frequency, id, difficulty, problemUrl, problemName, acceptance);
    this.companyName = companyName;
    this.duration = duration;
  }
}

class ProblemTag {
  constructor(duration, company, url) {
    this.url = url;
    this.duration = duration;
    this.company = company;
  }
}

class InfoList {
  constructor() {
    this.data = {};
  }

  getKeys() {
    return Object.keys(this.data);
  }

  getList(key) {
    if (key == undefined) throw new Error("Key cannot be undefined");
    if (key in this.data) return this.data[key];
    return [];
  }
}

class ProblemInfoList extends InfoList {
  push(key, value) {
    if (key == undefined || value == undefined)
      throw new Error("Key/Value error");
    if (key in this.data) {
      this.data[key].push(value);
      return;
    }
    let arr = [];
    arr.push(value);
    this.data[key] = arr;
  }
}

class CompanyProblemInfoList extends InfoList {
  push(key, value) {
    if (key in this.data) {
      this.data[key].push(value);
      return;
    }
    let arr = new ProblemArray();
    arr.push(value);
    this.data[key] = arr;
  }
}

class CompanyProblemDurations {
  static SIXMONTHS = "6 months";
  static TWOYEARS = "2 years";
  static ALLTIME = "All time";
  static ONEYEAR = "1 year";

  static DURATION_LIST = [
    CompanyProblemDurations.SIXMONTHS,
    CompanyProblemDurations.ONEYEAR,
    CompanyProblemDurations.TWOYEARS,
    CompanyProblemDurations.ALLTIME,
  ];
}

class ProblemArray extends Array {
  sort(by, reverse = false) {
    let sorter = new by();
    sorter.sort(this, reverse);
  }
}

class CSSStyler {
  static getContainerBackgroundColor() {
    let theme = localStorage.getItem("lc-theme");
    switch (theme) {
      case "dark":
        return "#151515";
      case "light":
        return "#f3f3f3";
      default:
        return "#151515";
    }
  }

  static getComplementaryColor() {
    let theme = localStorage.getItem("lc-theme");
    switch (theme) {
      case "dark":
        return "#282828";
      case "light":
        return "#dcdcdc";
      default:
        return "#282828";
    }
  }

  static COLOR_ACCENT = "#62C555";
  static BACKGROUND_CONTAINER_COLOR = "#101010";
  static SUB_BACKGROUND_CONTAINER_COLOR = "#282828";
  static TEXT_COLOR = "#dcdcdc";
  static TEXT_COLOR_SELECTED = "#7d7d7d";
}

export {
  ProblemInfo,
  CompanyProblemInfo,
  CompanyProblemInfoList,
  CompanyProblemDurations,
  ProblemArray,
  CSSStyler,
  ProblemTag,
  ProblemInfoList,
  InfoList,
};
