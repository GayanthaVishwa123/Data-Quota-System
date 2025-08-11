const express = require("express");
const app = express();
const Usercontroller = require(".DATA_PACKAGE_BACKEND/routes/userRoute");
const Packagecontroller = require("../DATA_PACKAGE_BACKEND/routes/pakageRoute");
const Authcontroller = require("../DATA_PACKAGE_BACKEND/routes/authRoute");
const DatausageController = require("../DATA_PACKAGE_BACKEND/routes/datausageRoute");

app.use(express.json());

app.use("/data-package-app/v1/backend/user", Usercontroller);
app.use("/data-package-app/v1/backend/pakage", Packagecontroller);
app.use("/data-package-app/v1/backend/auth", Authcontroller);
app.use("/data-package-app/v1/backend/test", DatausageController);

module.exports = app;
