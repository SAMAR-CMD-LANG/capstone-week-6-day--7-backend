import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { supabase } from "./db.js";
import dotenv from "dotenv";

dotenv.config();

// Configure Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("Google OAuth Strategy - Profile received:", {
          id: profile.id,
          displayName: profile.displayName,
          emails: profile.emails,
          photos: profile.photos
        });

        const email = profile.emails && profile.emails[0]?.value;
        const name = profile.displayName || profile.name?.givenName + " " + profile.name?.familyName;

        if (!email) {
          console.error("No email found in Google profile:", profile);
          return done(new Error("No email found in Google profile"), null);
        }

        if (!name) {
          console.error("No name found in Google profile:", profile);
          return done(new Error("No name found in Google profile"), null);
        }

        // Check if user already exists
        const { data: existingUser, error: fetchError } = await supabase
          .from("Users")
          .select("*")
          .eq("email", email)
          .single();

        if (existingUser && !fetchError) {
          console.log("Google OAuth: User already exists, logging in:", existingUser.email);
          return done(null, existingUser);
        }

        // Create new user
        console.log("Google OAuth: Creating new user for:", email);
        const { data: newUser, error: createError } = await supabase
          .from("Users")
          .insert([
            {
              name: name.trim(),
              email: email.toLowerCase().trim(),
              password: null, // OAuth users don't have passwords
            },
          ])
          .select()
          .single();

        if (createError) {
          console.error("Error creating new user:", createError);

          // Handle specific database errors
          if (createError.code === '23505') { // Unique constraint violation
            console.log("User already exists, attempting to fetch existing user");
            const { data: retryUser, error: retryError } = await supabase
              .from("Users")
              .select("*")
              .eq("email", email)
              .single();

            if (retryUser && !retryError) {
              return done(null, retryUser);
            }
          }

          return done(createError, null);
        }

        console.log("Google OAuth: New user created successfully:", newUser.email);
        return done(null, newUser);
      } catch (error) {
        console.error("Error in Google OAuth strategy:", error);
        console.error("Error stack:", error.stack);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const { data: user, error } = await supabase
      .from("Users")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return done(error, null);
    }

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
});

export default passport;
