function setContent(id, newvalue) {
    var s = document.getElementById(id);
    if (s.tagName.toUpperCase() === "INPUT") {
        s.value = newvalue;
    } else {
        s.innerHTML = newvalue;
    }
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

        const userDataResponse = await getUserData();
        const userData = await userDataResponse.json();
        console.log(userData);

        const recommendedData = await recommend(userData);
        console.log("Recommended results:");
        console.log(recommendedData);

        let bullets = "<ul>";
        for (let i = 0; i < recommendedData.length; i++) {
            const url = recommendedData[i].url;
            const title = recommendedData[i].title;
            bullets += `<li><div class="circle"><span>${i + 1}</span></div><a href='${url}'>${title}</a></li>`
        }
        bullets += "</ul>"
        setContent("recommendedResults", bullets);

        setContent("loader", null);
    }
});

async function getUserData() {
    const cookie = await chrome.cookies.get({
        name: "auth._token.local",
        url: "https://www.heroic.us",
    });
    const bearerToken = cookie.value.replace("%20", " ");
    const headers = new Headers({
        'x-access-token': bearerToken
    });
    const result = await fetch('https://www.optimize.me/api/v3/account/user/lists/', { credentials: "include", headers: headers });
    return result;
}

async function recommend(userData) {
    const completed = userData.completed.itemIds;
    const faves = userData.faves.itemIds;

    const recommendedResponse = await fetch('https://e137lli3v6.execute-api.us-east-1.amazonaws.com/prod/plusone/recommended', {
        method: "POST",
        headers: new Headers({ "secret": "Jyq5qtpQOk05wp97144I" }),
        body: JSON.stringify({
            "count": 5,
            "faves": faves,
            "completed": completed,
        })
    });

    const recommendedData = await recommendedResponse.json();
    return recommendedData;
}
