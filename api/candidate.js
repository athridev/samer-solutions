const invitationHandler = require("./candidate/_invitation");
const submitHandler = require("./candidate/_submit");

module.exports = async function handler(request, response) {
  const url = new URL(request.url, "https://samer.solutions");
  const resource = url.searchParams.get("resource") || "invitation";

  if (resource === "submit") {
    return submitHandler(request, response);
  }

  return invitationHandler(request, response);
};
