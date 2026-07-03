const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Blog = require("../models/blog");
const Comment = require("../models/comment");

const router = Router();

const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer Configuration
// - In-memory storage to prevent local file loss and nodemon restarts
// - Only image files
// - Max 5MB
const storage = multer.memoryStorage();

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

// Persistent Image Helpers (Cloudinary with Base64 Fallback)
async function persistImage(file) {
  if (!file) return null;

  const isCloudinaryConfigured =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

  if (isCloudinaryConfigured) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "blogify" },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        },
      );
      uploadStream.end(file.buffer);
    });
  } else {
    // Fallback: Convert to Base64 Data URL and store in DB
    const base64Data = file.buffer.toString("base64");
    return `data:${file.mimetype};base64,${base64Data}`;
  }
}

async function deletePersistedImage(imageUrl) {
  if (!imageUrl) return;

  if (imageUrl.includes("res.cloudinary.com")) {
    try {
      const parts = imageUrl.split("/");
      const uploadIndex = parts.indexOf("upload");
      if (uploadIndex === -1) return;
      const pathParts = parts.slice(uploadIndex + 2); // skips 'upload' and version 'vxxxx'
      const publicIdWithExt = pathParts.join("/");
      const publicId = publicIdWithExt.substring(
        0,
        publicIdWithExt.lastIndexOf("."),
      );
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error("Failed to delete image from Cloudinary:", error);
    }
  } else if (imageUrl.startsWith("/uploads/")) {
    // Delete legacy local files if they exist
    try {
      const localPath = path.join(__dirname, "../public", imageUrl);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    } catch (error) {
      console.error("Failed to delete legacy local image:", error);
    }
  }
}

// Render Add Blog Page
router.get("/add-new", (req, res) => {
  if (!req.user) return res.redirect("/user/signin");

  res.render("addBlog", { user: req.user });
});

// Create Blog
router.post("/", upload.single("coverImage"), async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin");

    const { title, body } = req.body;

    const coverImageURL = req.file
      ? await persistImage(req.file)
      : "/images/default-cover.jpg";

    const blog = await Blog.create({
      title,
      body,
      createdBy: req.user._id,
      coverImageURL,
    });

    res.redirect(`/blog/${blog._id}`);
  } catch (error) {
    console.error("Create Blog Error:", error);
    res.redirect("/");
  }
});

// View Blog
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

// Edit Blog Page
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

// Update Blog
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
      // Clean up old image if necessary
      if (blog.coverImageURL !== "/images/default-cover.jpg") {
        await deletePersistedImage(blog.coverImageURL);
      }

      // Upload new image
      blog.coverImageURL = await persistImage(req.file);
    }

    await blog.save();

    res.redirect(`/blog/${blog._id}`);
  } catch (error) {
    console.error("Update Blog Error:", error);
    res.redirect("/");
  }
});

// Delete Blog
router.post("/delete/:id", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/user/signin");

    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.redirect("/");

    if (!blog.createdBy.equals(req.user._id)) {
      return res.redirect("/");
    }

    // Delete associated comments
    await Comment.deleteMany({ blogId: blog._id });

    // Clean up old image if not the default cover
    if (blog.coverImageURL !== "/images/default-cover.jpg") {
      await deletePersistedImage(blog.coverImageURL);
    }

    await blog.deleteOne();

    res.redirect("/");
  } catch (error) {
    console.error("Delete Blog Error:", error);
    res.redirect("/");
  }
});

// Add Comment
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

// Delete Comment
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
