
function fetchLatestUpdate() { 
    let range = "metadata!A:B"
    let url =  ``
    fetch(url)
    .then(data => data.json())
    .then(data => setTextToElement(data))
}

function setTextToElement(data) { 
    let strings = data["values"]
    for(let i =0; i <= strings.length-1; i ++) { 
        let text = strings[i][0] + ": " + strings[i][1]
        let element = getSpan(text)
        let parent = document.getElementById("data-update-data")
        parent.appendChild(element)
        parent.appendChild(document.createElement('br'))
    }
    return data["values"][0][1]
}

function getSpan(text){ 
    let span =  document.createElement("span")
    span.textContent = text; 
    return span 
}


fetchLatestUpdate()
