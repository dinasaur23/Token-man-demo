import User from "../models/User.js";
import jwt from "jsonwebtoken";

const handleErrors = (err) => {
  console.error("Auth error:", err);

  const errors = {
    email: "",
    password: "",
  };

  if (err.message === "incorrect email") {
    errors.email = "That email is not registered";
  }

  if (err.message === "incorrect password") {
    errors.password = "That password is incorrect";
  }

  if (err.code === 11000) {
    errors.email = "That email is already registered";
    return errors;
  }

  if (err.name === "ValidationError") {
    Object.values(err.errors).forEach(({ properties }) => {
      if (properties?.path && properties?.message) {
        errors[properties.path] = properties.message;
      }
    });
  }

  return errors;
};

const maxAge = 3 * 24 * 60 * 60;

const createToken = (id) => {
  return jwt.sign({ id }, "dinasaur secret", {
    expiresIn: maxAge,
  });
};

export const postSignup = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.create({ email, password });
    const token = createToken(user._id);

    res.cookie("jwt", token, {
      httpOnly: true,
      maxAge: maxAge * 1000,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    res.status(201).json({
      ok: true,
      user: user._id,
      token,
    });
    // } catch (err) {
    //   const errors = handleErrors(err);
    //   res.status(400).json({ errors });
    // }
  } catch (err) {
    console.error("SIGNUP ERROR:", err);

    const errors = handleErrors(err);

    res.status(400).json({
      errors,
      debugMessage:
        process.env.NODE_ENV !== "production" ? err.message : undefined,
    });
  }
};

export const postLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.login(email, password);
    const token = createToken(user._id);

    res.cookie("jwt", token, {
      httpOnly: true,
      maxAge: maxAge * 1000,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    res.status(201).json({
      ok: true,
      user: user._id,
      token,
    });
  } catch (err) {
    const errors = handleErrors(err);
    res.status(400).json({ errors });
  }
};

export const getLogout = (req, res) => {
  res.cookie("jwt", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    expires: new Date(0),
    path: "/",
  });

  res.status(200).json({ ok: true });
};
