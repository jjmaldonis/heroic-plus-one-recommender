function randomInt(min, max) {
    return Math.floor(Math.random() * max) + min;
}

function setContent(id, newvalue) {
    var s = document.getElementById(id);
    if (s.tagName.toUpperCase() === "INPUT") {
        s.value = newvalue;
    } else {
        s.innerHTML = newvalue;
    }
}

function openLinksInSameTab() {
    // If a link is clicked, open it in the same tab.
    var hrefs = document.getElementsByTagName("a");
    function openLink() {
        var href = this.href;
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            var tab = tabs[0];
            chrome.tabs.update(tab.id, { url: href });
        });
    }
    for (let i = 0, a; a = hrefs[i]; ++i) {
        hrefs[i].addEventListener('click', openLink);
    }
}

function helpIcon(tooltip) {
    const helpIcon = `
    <div class="tooltip">&#x1F6C8;
        <span class="tooltiptext">${tooltip}</span>
    </div>
    `;
    return helpIcon;
}

window.onload = function () {
    const recommendButtonText = [
        "Go again",
        "Feed me knowledge!",
        "I'm hungry, feed me more!",
        "Give me more!",
        "Let's go!",
        "Let's do another!",
        "Let's dance!",
        "Let's dance again!",
        "Another round!",
        // "Here's your Huckleberry!",
        "Ride the wave!",
        "Dig deeper!",
        "Whoop! Here it is!",
        "Show me the light!",
        "Check these out!",
        "How about these?",
        "Check this sh*t out!",
        "Take a look at these!",
    ];
    let buttonText = recommendButtonText[randomInt(0, recommendButtonText.length)];
    if (buttonText == "Check this s**t out!") {
        buttonText = recommendButtonText[randomInt(0, recommendButtonText.length)];
    }
    setContent("recommendButton", buttonText);
}

const button = document.querySelector("button");
button.addEventListener("click", async () => {
    const heroic = 'https://www.heroic.us';
    const optimize = 'https://optimize.me';
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var activeTab = tabs[0];
    var activeTabUrl = activeTab.url;

    if (activeTabUrl.startsWith(heroic) || activeTabUrl.startsWith(optimize)) {
        console.log(`Recommending...`)

        const loader = `<div class="loadersmall"></div>`;
        setContent("loader", loader);
        setContent("button-wrapper", null);

        const bearerToken = await getBearerToken();
        if (!bearerToken) {
            setContent("loader", null);
            setContent("error", `Please login to see your recommendations.`);
            openLinksInSameTab();
            return;
        }

        const userDataResponse = await getUserData(bearerToken);
        const userData = await userDataResponse.json();
        console.log(userData);
        const completed = userData.completed.itemIds;
        const faves = userData.faves.itemIds;
        if (completed.length === 0 || faves.length === 0) {
            setContent("button-wrapper", null);
            setContent("error", `You must have at least one completed and one favorited +1 to get recommendations.`);
            openLinksInSameTab();
            return;
        }

        const N = 5;
        const recommendedData = await recommend(userData, N);
        console.log("Recommended results:");
        console.log(recommendedData);
        const L = recommendedData.length;

        const tooltips = [
            "Stay in your rut",
            "Tow the line",
            "More like this",
            "Check this one out",
            "Here's something similar",
            "You might like this one",
            "Expand on that idea",
            "Give me another",
            "Explore a tangent",
            "Dig deeper",
            "Dive deeper",
            "Check it out",
            "Explore similar concepts",
            "Discover another",
            "Discover another like this",
            "Explore more",
        ];
        const different_tooltips = [
            "Expand your horizons",
            "Think different",
            "Shake up your world",
            "A contrarians view",
            // "Get out of your rut",
            "Think outside your box",
            "What's outside your box?",
        ];

        let bullets = "<ul>";
        for (let i = 0; i < recommendedData.length - 1; i++) {
            let url = recommendedData[i].url;
            let title = recommendedData[i].title;
            let tooltip = tooltips[randomInt(0, tooltips.length)];
            bullets += `<li><div class="circle-red"><span>${i + 1}</span></div><a href="${url}" title="${tooltip}">${title}</a></li>`
        }
        let url = recommendedData[L - 1].url;
        let title = recommendedData[L - 1].title;
        let tooltip = different_tooltips[randomInt(0, different_tooltips.length)];
        bullets += `<li><div class="circle-black"><span>${L}</span></div><a href="${url}" title="${tooltip}">${title}</a></li>`
        bullets += "</ul>"
        setContent("recommendedResults", bullets);

        const help = `
        <hr>
        <ul>
          <li>
            <div class="circle-red-small"></div>
            <span>Your top recommendations.</span>
          </li>
          <li>
            <div class="circle-black-small"></div>
            <span>Shake up your world.</span>
          </li>
        </ul>
        `;

        // setContent("help-text", help);

        setContent("loader", null);

        openLinksInSameTab();
    } else {
        setContent("button-wrapper", null);
        setContent("error", `Go to <a href="https://www.heroic.us/optimize/plus-one">heroic.us</a> to see your recommendations.`);
        openLinksInSameTab();
    }
});

async function getBearerToken() {
    const cookie = await chrome.cookies.get({
        name: "auth._token.local",
        url: "https://www.heroic.us",
    });
    const bearerToken = cookie.value.replace("%20", " ");
    if (bearerToken === "false") {
        return null;
    } else {
        return bearerToken;
    }
}

async function getUserData(bearerToken) {
    const headers = new Headers({
        'x-access-token': bearerToken
    });
    const result = await fetch('https://www.optimize.me/api/v3/account/user/lists/', { credentials: "include", headers: headers });
    return result;
}

async function recommend(userData, count) {
    const completed = userData.completed.itemIds;
    const faves = userData.faves.itemIds;

    const recommendedResponse = await fetch('https://e137lli3v6.execute-api.us-east-1.amazonaws.com/prod/plusone/recommended', {
        method: "POST",
        headers: new Headers({ "secret": "Jyq5qtpQOk05wp97144I" }),
        body: JSON.stringify({
            "count": count,
            "faves": faves,
            "completed": completed,
        })
    });

    const recommendedData = await recommendedResponse.json();
    return recommendedData;
}
