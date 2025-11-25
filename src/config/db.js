// src/config/db.js
import mongoose from 'mongoose';

const connectDB = async () => {
  // try {
  //   const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mydatabase';
  //   await mongoose.connect(uri, { dbName: process.env.MONGO_DB || 'enviro_master' });
  //   console.log('✅ MongoDB connected successfully');
  // } catch (err) {
  //   console.error('❌ MongoDB connection failed:', err.message);
  //   process.exit(1);
  // }
};

export default connectDB;
