#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const command = process.argv[2];
const appName = process.argv[3];

if(command === "create"){

    if(!appName){
        console.log("Please provide app name");
        return;
    }

    const appPath = path.join("miniapps", appName);

    if(fs.existsSync(appPath)){
        console.log("App already exists");
        return;
    }

    fs.mkdirSync(appPath,{recursive:true});
    fs.mkdirSync(path.join(appPath,"assets"));
    fs.mkdirSync(path.join(appPath,"components"));

    fs.writeFileSync(path.join(appPath,"miniapp.json"),JSON.stringify({
        name: appName,
        version: "1.0.0",
        entry: "index.html",
        permissions:["auth"],
        author:"Developer"
    },null,2));

    fs.writeFileSync(path.join(appPath,"index.html"),`
<h2>${appName}</h2>

<button id="loginBtn">Login</button>

<pre id="result"></pre>

<script type="module" src="index.js"></script>
`);

    fs.writeFileSync(path.join(appPath,"index.js"),`
import "../../sdk/miniapp-sdk.js";

fetch("miniapp.json")
.then(res=>res.json())
.then(manifest=>{

    MiniApp.init(manifest);

});

document.getElementById("loginBtn").onclick = function(){

    MiniApp.auth.login().then(user=>{

        document.getElementById("result").innerText =
        JSON.stringify(user,null,2);

    });

};
`);

    console.log("Mini app created:", appName);

}

else if(command === "build"){

    console.log("Building mini app...");

}

else if(command === "publish"){

    console.log("Publishing mini app...");

}

else{

    console.log("MiniApp CLI");
    console.log("Commands:");
    console.log("create <app-name>");
    console.log("build");
    console.log("publish");

}
