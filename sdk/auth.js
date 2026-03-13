// export const auth = {

//   login() {

//     return new Promise((resolve) => {

//       window.parent.postMessage({
//         type: "AUTH_LOGIN"
//       }, "*");

//       window.addEventListener("message", function handler(event){

//         if(event.data.type === "AUTH_RESPONSE"){

//           resolve(event.data.user);

//           window.removeEventListener("message", handler);

//         }

//       });

//     });

//   }

// };
