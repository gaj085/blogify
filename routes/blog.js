const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Blog = require("../models/blog");
const Comment = require("../models/comment");

const router = Router();

/* ======================================================
   Ensure Upload Directory Exists
====================================================== */

const uploadDir = path.join(__dirname, "../public/uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ======================================================
   Multer Configuration
   - Only image files
   - Max 5MB
====================================================== */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* ======================================================
   Render Add Blog Page
====================================================== */

router.get("/add-new", (req, res) => {
  if (!req.user) return res.redirect("/user/signin");

  res.render("addBlog", { user: req.user });
});

/* ======================================================
   Create Blog
====================================================== */

router.post("/", upload.single("coverImage"), async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin");

    const { title, body } = req.body;

    const blog = await Blog.create({
      title,
      body,
      createdBy: req.user._id,
      coverImageURL: req.file
        ? `/uploads/${req.file.filename}`
        : "/images/default-cover.jpg",
    });

    res.redirect(`/blog/${blog._id}`);
  } catch (error) {
    console.error("Create Blog Error:", error);
    res.redirect("/");
  }
});

/* ======================================================
   View Blog
====================================================== */

router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate("createdBy");

    if (!blog) return res.redirect("/");

    const comments = await Comment.find({ blogId: blog._id })
      .populate("createdBy")
      .sort({ createdAt: -1 });

    res.render("blog", {
      user: req.user,
      blog,
      comments,
    });
  } catch (error) {
    console.error("View Blog Error:", error);
    res.redirect("/");
  }
});

/* ======================================================
   Edit Blog Page
====================================================== */

router.get("/edit/:id", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin");

    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.redirect("/");

    if (!blog.createdBy.equals(req.user._id)) {
      return res.redirect("/");
    }

    res.render("editBlog", {
      user: req.user,
      blog,
    });
  } catch (error) {
    console.error("Edit Page Error:", error);
    res.redirect("/");
  }
});

/* ======================================================
   Update Blog
====================================================== */

router.post("/edit/:id", upload.single("coverImage"), async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin");

    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.redirect("/");

    if (!blog.createdBy.equals(req.user._id)) {
      return res.redirect("/");
    }

    blog.title = req.body.title;
    blog.body = req.body.body;

    if (req.file) {
      const oldImagePath = path.join(
        __dirname,
        "../public",
        blog.coverImageURL,
      );

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      blog.coverImageURL = `/uploads/${req.file.filename}`;
    }

    await blog.save();

    res.redirect(`/blog/${blog._id}`);
  } catch (error) {
    console.error("Update Blog Error:", error);
    res.redirect("/");
  }
});

/* ======================================================
   Delete Blog
====================================================== */

router.post("/delete/:id", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin");

    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.redirect("/");

    if (!blog.createdBy.equals(req.user._id)) {
      return res.redirect("/");
    }

    await Comment.deleteMany({ blogId: blog._id });
    await blog.deleteOne();

    res.redirect("/");
  } catch (error) {
    console.error("Delete Blog Error:", error);
    res.redirect("/");
  }
});

/* ======================================================
   Add Comment
====================================================== */

router.post("/comment/:blogId", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin");

    await Comment.create({
      content: req.body.content,
      blogId: req.params.blogId,
      createdBy: req.user._id,
    });

    res.redirect(`/blog/${req.params.blogId}`);
  } catch (error) {
    console.error("Add Comment Error:", error);
    res.redirect("/");
  }
});

/* ======================================================
   Delete Comment
====================================================== */

router.post("/comment/delete/:commentId", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin");

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.redirect("/");

    const blog = await Blog.findById(comment.blogId);

    const isCommentOwner = comment.createdBy.equals(req.user._id);
    const isBlogOwner = blog.createdBy.equals(req.user._id);

    if (!isCommentOwner && !isBlogOwner) {
      return res.redirect("/");
    }

    await comment.deleteOne();

    res.redirect(`/blog/${blog._id}`);
  } catch (error) {
    console.error("Delete Comment Error:", error);
    res.redirect("/");
  }
});

module.exports = router;
