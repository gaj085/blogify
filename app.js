require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const Blog = require("./models/blog");

const userRoute = require("./routes/user");
const blogRoute = require("./routes/blog");

const {
  checkForAuthenticationCookie,
} = require("./middlewares/authentication");

const app = express();
const PORT = process.env.PORT || 8000;

mongoose
  .connect(process.env.MONGO_URL)
  .then((e) => {
    console.log("MongoDB Connected");
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  });

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(checkForAuthenticationCookie("token"));
app.use(express.static(path.resolve("./public"))); // this basically says, public folder me jo bhi
// hai use static route ki tarah use kar sakte
// by default, express kisi bhi static assets ka access aise hi nhi deti

app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

// Make user available in all EJS templates
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

app.get("/", async (req, res) => {
  const allBlogs = await Blog.find({});

  // console.log(req.user);
  return res.render("home", {
    blogs: allBlogs,
  });
});

// Search route =>
app.get("/search", async (req, res) => {
  const query = req.query.query;

  if (!query) {
    return res.redirect("/");
  }

  try {
    const blogs = await Blog.find({
      title: { $regex: query, $options: "i" }, // case-insensitive search
    });

    return res.render("searchResults", {
      blogs,
      query,
    });
  } catch (err) {
    console.error(err);
    return res.redirect("/");
  }
});

app.use("/user", userRoute);
app.use("/blog", blogRoute);

app.listen(PORT, () => console.log(`Server connected at PORT: ${PORT}`));
