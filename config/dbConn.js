const mongoose = require('mongoose');

const connectDB = async () => {
  const connectionString = process.env.DATABASE_URI;

  try {
    console.log(`Connecting to: ${connectionString}`);
    await mongoose.connect(process.env.DATABASE_URI);

    console.log(
      `MongoDB Connected`
    );
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

module.exports = connectDB;