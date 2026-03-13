
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
