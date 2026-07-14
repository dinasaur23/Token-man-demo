import mongoose from "mongoose";

// export const connectDB = async () => {
//   try {
//     await mongoose.connect(process.env.MONGO_URI);
//     console.log("MONGODB CONNECTED");
//   } catch (error) {
//     console.error("error connecting to MONGODB", error);
//     process.exit(1);
//   }
// };

export const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MONGODB CONNECTED");
  } catch (error) {
    console.error("MONGODB ERROR:", error);
  }
};
