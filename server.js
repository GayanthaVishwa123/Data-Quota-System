const app = require("./app");

// Connect to database
connectDB();

app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
