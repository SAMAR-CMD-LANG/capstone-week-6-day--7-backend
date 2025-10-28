import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { supabase } from "./db.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import session from "express-session";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "test_session_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

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

  res.cookie(process.env.COOKIE_NAME, token, {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });

  return token;
}

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
      return res.status(500).json({ message: "error creating user" });
    }
    res.status(201).json({
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
    return res
      .status(400)
      .json({ message: "Both email and password are required" });
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

    if (!user.password) {
      return res.status(400).json({
        message: "This account uses Google login. Please sign in with Google.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    generateTokenAndSetCookie(user, res);

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
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
    const cookieToken = req.cookies && req.cookies[process.env.COOKIE_NAME];
    if (!cookieToken) {
      return res.status(401).json({ user: null });
    }

    const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
    const { data: user, error } = await supabase
      .from("Users")
      .select("id, name, email, created_at")
      .eq("id", decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ user: null });
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error("Auth me error:", err);
    res.status(401).json({ user: null });
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
    limit = Math.min(limit, 100);

    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let query = supabase
      .from("Posts")
      .select("*", { count: "exact" })
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

    if (error || !updatedPost) {
      return res
        .status(400)
        .json({
          message: "Not authorized to update this post or post not found",
        });
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
      .select()
      .single();
    if (error || !deleteData) {
      return res
        .status(400)
        .json({
          message: "not authorized to delete this post or post not found",
        });
    }
    res
      .status(200)
      .json({ message: "post deleted successfully", post: deleteData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "internal server error" });
  }
});

export default app;
