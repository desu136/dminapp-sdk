

const MiniApp = {

  declaredPermissions: [],

  meta: {
    sdkVersion: "1.0.0",
    appId: null,
    instanceId: null
  },

  notify(options){
    return MiniApp.request("messaging.notify", options);
  },

  pay(options){
    return MiniApp.payments.requestPayment({
      idempotencyKey: (crypto?.randomUUID ? crypto.randomUUID() : ("idem_" + Date.now())),
      amountMinor: Math.round(Number(options?.amount || 0) * 100),
      currency: String(options?.currency || "").toUpperCase(),
      description: String(options?.description || "")
    });
  },

  camera:{
    open(options = {}){
      return MiniApp.request("device.camera.capture", options);
    }
  },

  capabilities: [],

  lifecycle: {
    launch: [],
    show: [],
    hide: [],
    close: []
  },

  events: {},

  async init(manifest){

    this.declaredPermissions = manifest.permissions || [];
    this.meta.appId = manifest.appId || null;

    const result = await this.request("core.init", {
      appId: this.meta.appId,
      permissions: this.declaredPermissions
    });

    this.meta.instanceId = result.instanceId || null;
    this.capabilities = result.capabilities || [];

    return result;

  },

  getCapabilities(){
    return this.request("core.getCapabilities");
  },

  hasPermission(permission){

    if(!this.declaredPermissions.includes(permission)){
      const err = {
        code: "ERR_PERMISSION_REQUIRED",
        message: "Permission required: " + permission,
        details: { permission },
        retryable: false
      };
      throw err;
    }

  },

  on(name, callback){

    if(!this.events[name]){
      this.events[name] = [];
    }

    this.events[name].push(callback);

  },

  emit(name, data){

    const handlers = this.events[name] || [];
    handlers.forEach(cb => cb(data));

  },

  onLaunch(callback){
    this.lifecycle.launch.push(callback);
  },

  onShow(callback){
    this.lifecycle.show.push(callback);
  },

  onHide(callback){
    this.lifecycle.hide.push(callback);
  },

  onClose(callback){
    this.lifecycle.close.push(callback);
  },

  trigger(event){

    if(this.lifecycle[event]){
      this.lifecycle[event].forEach(cb => cb());
    }

  },

  /* GENERIC REQUEST ENGINE */

  request(method, params = {}){

    return new Promise((resolve,reject)=>{

      const requestId = (crypto?.randomUUID ? crypto.randomUUID() : ("req_" + Date.now() + "_" + Math.random().toString(16).slice(2)));

      const message = {
        v: 1,
        type: "request",
        id: requestId,
        method: method,
        params: params,
        meta: {
          sdkVersion: MiniApp.meta.sdkVersion,
          appId: MiniApp.meta.appId,
          instanceId: MiniApp.meta.instanceId,
          timestamp: Date.now()
        }
      };

      window.parent.postMessage({
        __miniapp_bridge__: true,
        ...message
      },"*");

      function handler(event){

        const message = event.data;

        if(message && message.__miniapp_bridge__ === true && message.type === "response" && message.id === requestId){

          window.removeEventListener("message",handler);

          if(message.ok){
            resolve(message.result);
          }else{
            reject(message.error);
          }

        }

      }

      window.addEventListener("message",handler);

    });

  },

  /* AUTH API */

  auth:{
    login(){

      return MiniApp.permissions.request(["auth.profile","auth.token"]).then((res)=>{

        if(res?.["auth.profile"] !== "granted" || res?.["auth.token"] !== "granted"){
          const err = {
            code: "ERR_PERMISSION_DENIED",
            message: "Permission denied",
            details: { scope: "auth.profile/auth.token" },
            retryable: false
          };
          throw err;
        }

        return Promise.all([
          MiniApp.auth.getProfile(),
          MiniApp.auth.getToken()
        ]);

      }).then(([profile, token])=>{
        return {
          id: profile?.id,
          name: profile?.displayName,
          token: token?.accessToken
        };
      });

    },

    getProfile(){

      MiniApp.hasPermission("auth.profile");

      return MiniApp.request("auth.getProfile");

    },

    getToken(options = {}){

      MiniApp.hasPermission("auth.token");

      return MiniApp.request("auth.getToken", options);

    },

    logout(){

      MiniApp.hasPermission("auth.logout");

      return MiniApp.request("auth.logout");

    }
  },

  /* STORAGE API */

  storage:{
    setItem(key,value){

      MiniApp.hasPermission("storage.kv");

      const normalized = (typeof value === "string") ? value : JSON.stringify(value);

      return MiniApp.request("storage.setItem", { key, value: normalized });

    },

    getItem(key){

      MiniApp.hasPermission("storage.kv");

      return MiniApp.request("storage.getItem", { key });

    },

    removeItem(key){

      MiniApp.hasPermission("storage.kv");

      return MiniApp.request("storage.removeItem", { key });

    },

    clear(){

      MiniApp.hasPermission("storage.kv");

      return MiniApp.request("storage.clear");

    },

    getQuota(){

      MiniApp.hasPermission("storage.kv");

      return MiniApp.request("storage.getQuota");

    }

  },

  /* UI API */

  ui:{

    showModal(options){
      return MiniApp.ui.modal({
        title: options?.title,
        message: options?.content ?? options?.message
      });
    },

    modal(options){

      return MiniApp.request("ui.modal", options);

    },

    loading:{
      show(options = {}){
        return MiniApp.request("ui.loading.show", options);
      },

      hide(){
        return MiniApp.request("ui.loading.hide");
      }
    },

    toast(options){

      return MiniApp.request("ui.toast", options);

    }

  },

  payments:{
    requestPayment(req){

      MiniApp.hasPermission("payments.request");

      return MiniApp.request("payments.requestPayment", req);

    }
  }

  ,

  navigation:{
    open(options){
      return MiniApp.request("navigation.open", options);
    },

    back(options = {}){
      return MiniApp.request("navigation.back", options);
    },

    setTitle(title){
      return MiniApp.request("navigation.setTitle", { title });
    }
  },

  device:{
    clipboard:{
      writeText(text){
        MiniApp.hasPermission("device.clipboard");
        return MiniApp.request("device.clipboard.writeText", { text });
      },

      readText(){
        MiniApp.hasPermission("device.clipboard");
        return MiniApp.request("device.clipboard.readText");
      }
    },

    location:{
      getCurrentPosition(options = {}){
        MiniApp.hasPermission("device.location");
        return MiniApp.request("device.location.getCurrentPosition", options);
      },

      watchPosition(options = {}){
        MiniApp.hasPermission("device.location");
        return MiniApp.request("device.location.watchPosition", options);
      },

      clearWatch(watchId){
        MiniApp.hasPermission("device.location");
        return MiniApp.request("device.location.clearWatch", { watchId });
      }
    },

    scanner:{
      scan(options = {}){
        MiniApp.hasPermission("device.scanner");
        return MiniApp.request("device.scanner.scan", options);
      }
    },

    file:{
      pick(options = {}){
        MiniApp.hasPermission("device.file");
        return MiniApp.request("device.file.pick", options);
      }
    }
  }

};

/* PERMISSION API */

const permissions = {

  query(scope){

    return MiniApp.request("permissions.query",{ scope });

  },

  request(scopes){

    return MiniApp.request("permissions.request",{ scopes });

  }

};

MiniApp.permissions = permissions;

window.MiniApp = MiniApp;

/* LIFECYCLE LISTENER */

window.addEventListener("message",(event)=>{

  const message = event.data;

  if(message && message.__miniapp_bridge__ === true && message.type === "event"){

    if(message.name && String(message.name).startsWith("lifecycle.")){
      const mapped = message.name
        .replace("lifecycle.onLaunch","launch")
        .replace("lifecycle.onShow","show")
        .replace("lifecycle.onHide","hide")
        .replace("lifecycle.onClose","close");
      MiniApp.trigger(mapped);
    }

    MiniApp.emit(message.name, message.data);

  }

});
