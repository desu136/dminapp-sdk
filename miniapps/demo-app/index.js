
import "../../sdk/miniapp-sdk.js";

fetch("miniapp.json")
  .then(res => res.json())
  .then(manifest => {

    MiniApp.init(manifest);

  });

const result = document.getElementById("result");

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("saveBtn").addEventListener("click", saveData);
document.getElementById("loadBtn").addEventListener("click", loadData);
document.getElementById("payBtn").addEventListener("click", pay);

document.getElementById("modalBtn").addEventListener("click", showModal);
document.getElementById("toastBtn").addEventListener("click", showToast);
document.getElementById("permBtn").addEventListener("click", requestPermission);

document.getElementById("notifyBtn").addEventListener("click", notify);
document.getElementById("cameraBtn").addEventListener("click", capturePhoto);
document.getElementById("locBtn").addEventListener("click", getLocation);
document.getElementById("watchLocBtn").addEventListener("click", startLocationWatch);
document.getElementById("stopWatchLocBtn").addEventListener("click", stopLocationWatch);
document.getElementById("scanBtn").addEventListener("click", scanQr);
document.getElementById("fileBtn").addEventListener("click", pickFile);

let activeWatchId = null;

MiniApp.on("device.location.onChange", (data)=>{
  result.innerText = JSON.stringify({ event: "device.location.onChange", data }, null, 2);
});

MiniApp.onLaunch(()=>{
  result.innerText = JSON.stringify({ event: "lifecycle.launch" }, null, 2);
});

MiniApp.onShow(()=>{
  result.innerText = JSON.stringify({ event: "lifecycle.show" }, null, 2);
});

MiniApp.onHide(()=>{
  result.innerText = JSON.stringify({ event: "lifecycle.hide" }, null, 2);
});

MiniApp.onClose(()=>{
  result.innerText = JSON.stringify({ event: "lifecycle.close" }, null, 2);
});

function requestPermission(){

  MiniApp.permissions.request(["device.camera"]).then(res => {

    result.innerText = JSON.stringify(res,null,2);

  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });

}

function notify(){
  MiniApp.notify({
    title: "Demo Notify",
    message: "Hello from demo mini-app"
  }).then((res)=>{
    result.innerText = JSON.stringify(res, null, 2);
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });
}

function capturePhoto(){
  MiniApp.permissions.request(["device.camera"]).then((perm)=>{
    if(perm?.["device.camera"] !== "granted"){
      result.innerText = JSON.stringify(perm, null, 2);
      return null;
    }

    return MiniApp.camera.open({});
  }).then((photo)=>{
    if(photo){
      result.innerText = JSON.stringify(photo, null, 2);
    }
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });
}

function getLocation(){
  MiniApp.permissions.request(["device.location"]).then((perm)=>{
    if(perm?.["device.location"] !== "granted"){
      result.innerText = JSON.stringify(perm, null, 2);
      return null;
    }
    return MiniApp.device.location.getCurrentPosition({ timeoutMs: 10000 });
  }).then((pos)=>{
    if(pos){
      result.innerText = JSON.stringify(pos, null, 2);
    }
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });
}

function startLocationWatch(){
  MiniApp.permissions.request(["device.location"]).then((perm)=>{
    if(perm?.["device.location"] !== "granted"){
      result.innerText = JSON.stringify(perm, null, 2);
      return null;
    }

    return MiniApp.device.location.watchPosition({ timeoutMs: 10000 });
  }).then((res)=>{
    if(res?.watchId){
      activeWatchId = res.watchId;
      result.innerText = JSON.stringify({ watchId: activeWatchId }, null, 2);
    }
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });
}

function stopLocationWatch(){
  MiniApp.permissions.request(["device.location"]).then((perm)=>{
    if(perm?.["device.location"] !== "granted"){
      result.innerText = JSON.stringify(perm, null, 2);
      return null;
    }

    if(!activeWatchId){
      result.innerText = JSON.stringify({ error: "No active watch" }, null, 2);
      return null;
    }

    const watchId = activeWatchId;
    activeWatchId = null;
    return MiniApp.device.location.clearWatch(watchId);
  }).then((res)=>{
    if(res){
      result.innerText = JSON.stringify(res, null, 2);
    }
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });
}

function scanQr(){
  MiniApp.permissions.request(["device.scanner"]).then((perm)=>{
    if(perm?.["device.scanner"] !== "granted"){
      result.innerText = JSON.stringify(perm, null, 2);
      return null;
    }
    return MiniApp.device.scanner.scan({});
  }).then((res)=>{
    if(res){
      result.innerText = JSON.stringify(res, null, 2);
    }
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });
}

function pickFile(){
  MiniApp.permissions.request(["device.file"]).then((perm)=>{
    if(perm?.["device.file"] !== "granted"){
      result.innerText = JSON.stringify(perm, null, 2);
      return null;
    }

    return MiniApp.device.file.pick({ accept: "*/*" });
  }).then((file)=>{
    if(file){
      result.innerText = JSON.stringify(file, null, 2);
    }
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });
}

function login(){

  MiniApp.permissions.request(["auth.profile","auth.token"]).then((res)=>{

    if(res?.["auth.profile"] !== "granted"){
      result.innerText = JSON.stringify(res, null, 2);
      return null;
    }

    return MiniApp.auth.getProfile();

  }).then(user => {

    if(user){
      result.innerText = JSON.stringify(user,null,2);
    }

  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });

}

function saveData(){

  const cart = {
    item:"Pizza",
    price:20
  };

  MiniApp.permissions.request(["storage.kv"]).then(()=>{
    return MiniApp.storage.setItem("cart", JSON.stringify(cart));
  }).then(()=>{
    alert("Data Saved");
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });

}

function loadData(){

  MiniApp.permissions.request(["storage.kv"]).then(()=>{
    return MiniApp.storage.getItem("cart");
  }).then((data) => {
    let parsed = data;
    try{
      parsed = data ? JSON.parse(data) : null;
    }catch(e){
      parsed = data;
    }
    result.innerText = JSON.stringify(parsed,null,2);
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });

}

function showModal(){

  MiniApp.ui.modal({
    title:"Confirm Action",
    message:"Do you want to continue?"
  }).then(response => {

    result.innerText = JSON.stringify(response,null,2);

  });

}

function showToast(){

  MiniApp.ui.toast({
    message:"Operation completed!"
  });

}

function pay(){

  MiniApp.permissions.request(["payments.request"]).then((res)=>{

    if(res?.["payments.request"] !== "granted"){
      result.innerText = JSON.stringify(res, null, 2);
      return null;
    }

    return MiniApp.payments.requestPayment({
      idempotencyKey: (crypto?.randomUUID ? crypto.randomUUID() : ("idem_" + Date.now())),
      amountMinor: 499,
      currency: "USD",
      description: "Demo Purchase"
    });
  }).then((paymentResult) => {
    if(paymentResult){
      result.innerText = JSON.stringify(paymentResult, null, 2);
    }
  }).catch((e)=>{
    result.innerText = JSON.stringify(e, null, 2);
  });

}
