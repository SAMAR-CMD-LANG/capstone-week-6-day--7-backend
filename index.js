import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { supabase } from "./db.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "./passport-config.js";

dotenv.config();

const app = express();


app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL,
      "https://capstone-week-6-day-7-frontend.vercel.app",
      "http://localhost:3000", // For local development
      /\.vercel\.app$/ // Allow all Vercel preview deployments
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['Set-Cookie'],
  })
);


app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);


app.use(passport.initialize());
app.use(passport.session());

const PORT = process.env.PORT || 5000;


async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const headerToken = authHeader && authHeader.split(" ")[1];
  const cookieToken = req.cookies && req.cookies[process.env.COOKIE_NAME];
  const token = headerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ message: "Invalid or no token found" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
}

function generateTokenAndSetCookie(user, res) {
  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  const isProduction = process.env.NODE_ENV === "production";

  // Enhanced cookie settings for better cross-origin support
  const cookieOptions = {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    path: "/",
  };

  if (isProduction) {
    cookieOptions.sameSite = "none";
    cookieOptions.secure = true;
    // Don't set domain in production to allow cross-origin cookies
  } else {
    cookieOptions.sameSite = "lax";
    cookieOptions.secure = false;
  }

  console.log("Setting cookie with options:", cookieOptions);
  res.cookie(process.env.COOKIE_NAME, token, cookieOptions);

  return token;
}





app.get("/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"]
  })
);


app.get("/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth_failed`,
    session: false
  }),
  (req, res) => {
    try {
      console.log("Google OAuth callback - user data:", req.user);
      console.log("Environment:", process.env.NODE_ENV);
      console.log("Frontend URL:", process.env.FRONTEND_URL);
      console.log("Request headers:", req.headers);

      if (!req.user) {
        console.error("No user data received from Google OAuth");
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_user_data`);
      }

      // Generate token and set cookie with enhanced settings
      const token = generateTokenAndSetCookie(req.user, res);
      console.log("Token generated and cookie set for user:", req.user.email);
      console.log("Cookie settings applied");

      // Add a small delay to ensure cookie is properly set
      setTimeout(() => {
        res.redirect(`${process.env.FRONTEND_URL}/auth/callback?success=true`);
      }, 100);

    } catch (error) {
      console.error("Error in Google OAuth callback:", error);
      console.error("Error stack:", error.stack);

      // More specific error handling
      if (error.message && error.message.includes("migration required")) {
        res.redirect(`${process.env.FRONTEND_URL}/login?error=migration_required`);
      } else if (error.message && error.message.includes("duplicate")) {
        res.redirect(`${process.env.FRONTEND_URL}/login?error=account_exists`);
      } else {
        res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_callback_failed&details=${encodeURIComponent(error.message)}`);
      }
    }
  }
);

// ============ REGULAR AUTH ROUTES ============

app.post("/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "all fields are required" });
  }
  try {
    const { data: existingUser, error } = await supabase
      .from("Users")
      .select("*")
      .eq("email", email)
      .single();
    if (existingUser) {
      return res.status(400).json({ message: "user already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: newUser, error: userError } = await supabase
      .from("Users")
      .insert([{ name, email, password: hashedPassword }])
      .select()
      .single();
    if (userError) {
      res.status(500).json({ message: "error creating user" });
    }
    res
      .status(201)
      .json({
        message: "User created successfully",
        user: { id: newUser.id, name: newUser.name, email: newUser.email },
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Both email and password are required" });
  }

  try {
    const { data: user, error } = await supabase
      .from("Users")
      .select("*")
      .eq("email", email)
      .single();

    if (!user || error) {
      return res.status(400).json({ message: "User not found" });
    }

    // Check if user has a password (not OAuth-only user)
    if (!user.password) {
      return res.status(400).json({
        message: "This account uses Google login. Please sign in with Google."
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generate token and set cookie using helper function
    generateTokenAndSetCookie(user, res);

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profile_picture: user.profile_picture
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie(process.env.COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });
  res.status(200).json({ message: "logout successful" });
});
app.get("/auth/me", async (req, res) => {
  try {
    console.log("Auth me request - cookies:", req.cookies);
    console.log("Auth me request - headers:", req.headers);
    console.log("Auth me request - origin:", req.headers.origin);

    const cookieToken = req.cookies && req.cookies[process.env.COOKIE_NAME];
    console.log("Cookie token found:", !!cookieToken);
    console.log("Cookie name being used:", process.env.COOKIE_NAME);

    if (!cookieToken) {
      console.log("No cookie token found");
      console.log("Available cookies:", Object.keys(req.cookies || {}));
      return res.status(401).json({
        user: null,
        debug: "no_cookie",
        availableCookies: Object.keys(req.cookies || {})
      });
    }

    const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
    console.log("Token decoded successfully for user:", decoded.id);

    const { data: user, error } = await supabase
      .from("Users")
      .select("id, name, email, created_at, profile_picture")
      .eq("id", decoded.id)
      .single();

    if (error || !user) {
      console.log("User not found in database:", error);
      return res.status(401).json({ user: null, debug: "user_not_found", error: error?.message });
    }

    console.log("User found and returning:", user.email);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
        profile_picture: user.profile_picture
      }
    });
  } catch (err) {
    console.error("Auth me error:", err);
    console.error("Auth me error stack:", err.stack);
    res.status(401).json({
      user: null,
      debug: "token_invalid",
      error: err.message
    });
  }
});
app.get("/posts", async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    if (page < 1) {
      page = 1;
    }
    limit = Math.min((1, limit), 100);

    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let query = supabase
      .from("Posts")
      .select(`
        *,
        Users (
          id,
          name,
          email
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }
    query = query.range(start, end);
    const { data: posts, count, error } = await query;

    if (error) {
      return res.status(500).json({ message: "error fetching posts", error });
    }
    res.json({
      posts,
      totalPosts: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: page,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "posts fetch failed on server" });
  }
});
app.post("/posts", authenticateToken, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ message: "title and body are required" });
  }
  try {
    const { data: post, error } = await supabase
      .from("Posts")
      .insert([{ title, body, user_id: req.user.id }])
      .select()
      .single();
    if (error) {
      return res.status(500).json({ message: "error creating post", error });
    }
    res.status(201).json({ message: "post created successfully", post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "internal server error" });
  }
});

app.put("/posts/:id", authenticateToken, async (req, res) => {
  const postId = req.params.id;
  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ message: "title and body are required" });
  }
  try {
    const { data: updatedPost, error } = await supabase
      .from("Posts")
      .update({ title, body })
      .select()
      .eq("id", postId)
      .eq("user_id", req.user.id)
      .single();

    if (error) {
      res.status(400).json({ message: "Not authorized to update this post " });
    }
    res.status(200).json({ updatedPost });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "internal server error" });
  }
});

app.delete("/posts/:id", authenticateToken, async (req, res) => {
  const postId = req.params.id;
  try {
    const { data: deleteData, error } = await supabase
      .from("Posts")
      .delete()
      .eq("id", postId)
      .eq("user_id", req.user.id)
      .single();
    if (error) {
      return res
        .status(400)
        .json({ message: "not authorized to delete this post" });
    }
    res
      .status(200)
      .json({ message: "post deleted successfully", post: deleteData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "internal server error" });
  }
});
// Test endpoint to check cookie setting
app.get("/test-cookie", (req, res) => {
  res.cookie("test", "value", {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  res.json({ message: "Test cookie set", cookies: req.cookies });
});

// Debug endpoint for OAuth troubleshooting
app.get("/debug/oauth", (req, res) => {
  res.json({
    environment: process.env.NODE_ENV,
    frontendUrl: process.env.FRONTEND_URL,
    backendUrl: process.env.BACKEND_URL,
    cookieName: process.env.COOKIE_NAME,
    hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    cookies: req.cookies,
    headers: {
      origin: req.headers.origin,
      referer: req.headers.referer,
      userAgent: req.headers['user-agent']
    }
  });
});

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
});
