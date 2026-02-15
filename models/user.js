const { Schema, model } = require("mongoose");
const { createHmac, randomBytes } = require("crypto");
const { createTokenForUser } = require("../services/authentication");

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    salt: {
      type: String,
    },
    password: {
      type: String,
      required: true,
    },
    profileImageURL: {
      type: String,
      default: "/images/default-avatar.svg",
    },
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
  },
  { timestamps: true },
);

// jab bhi user ko save kroge => usse pehle kya karna hai =>
userSchema.pre("save", function (next) {
  const user = this;
  if (!user.isModified("password")) return next;

  const salt = randomBytes(16).toString(); // this is the secret key (randomly generated)
  const hashedPassword = createHmac("sha256", salt) // "sha256" => algo
    .update(user.password)
    .digest("hex");

  user.salt = salt;
  user.password = hashedPassword;

  next;
});

userSchema.static(
  "matchPasswordAndGenerateToken",
  async function (email, password) {
    const user = await this.findOne({ email });
    if (!user) throw new Error("User not found!");

    const salt = user.salt;
    const hashedPassword = user.password;

    const userProvidedPassHash = createHmac("sha256", salt)
      .update(password)
      .digest("hex");

    if (hashedPassword !== userProvidedPassHash)
      throw new Error("Incorrect Password!");

    // return { ...user._doc, password: undefined, salt: undefined }; // its actually 'user._doc' not 'user'
    const token = createTokenForUser(user);
    return token;
  },
);

const User = model("user", userSchema);

module.exports = User;
