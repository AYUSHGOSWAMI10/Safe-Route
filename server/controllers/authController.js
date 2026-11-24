const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { sub: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

async function demoLogin(req, res) {
  try {
    const demoEmail = process.env.DEMO_EMAIL;
    const demoPassword = process.env.DEMO_PASSWORD;

    if (!demoEmail || !demoPassword) {
      return res.status(500).json({
        success: false,
        message: "Demo login is not configured.",
      });
    }

    const { email, password } = req.body;

    // Check if demo mode is enabled
    const nodeEnv = process.env.NODE_ENV || "development";
    const demoLoginEnabled = process.env.DEMO_LOGIN_ENABLED === "true";

    if (nodeEnv === "production" || !demoLoginEnabled) {
      return res.status(403).json({
        success: false,
        message: "Demo login is disabled.",
      });
    }

    // Validate credentials
    if (email !== demoEmail || password !== demoPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid demo credentials.",
      });
    }

    // Generate JWT for demo user
    const token = jwt.sign(
      { sub: "demo-user" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.json({
      success: true,
      message: "Demo login successful.",
      token,
      user: {
        id: "demo-user",
        name: "Demo User",
        email: demoEmail,
      },
    });
  } catch (error) {
    console.error("Demo login error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to perform demo login.",
    });
  }
}

async function signup(req, res) {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({
        success: false,
        message: "Name must be between 2 and 80 characters.",
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must be 8–72 characters long.",
      });
    }

    const existingUser = await User.findOne({
      email: cleanEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash,
    });

    const token = createToken(user);

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Signup error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create account.",
    });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash");

    if (
      !user ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = createToken(user);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to log in.",
    });
  }
}

async function me(req, res) {
  try {
    if (req.isDemo) {
      return res.json({
        success: true,
        user: {
          id: "demo-user",
          name: "Demo User",
          email: process.env.DEMO_EMAIL || "demo@saferoute.local",
          role: "user",
        },
      });
    }
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.json({
      success: true,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Profile error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load profile.",
    });
  }
}

module.exports = { signup, login, me, demoLogin };