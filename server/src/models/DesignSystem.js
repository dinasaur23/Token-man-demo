import mongoose from "mongoose";

const { Schema } = mongoose;

const DesignSystemSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

DesignSystemSchema.index({ user: 1, name: 1 }, { unique: true });

const DesignSystem = mongoose.model("DesignSystem", DesignSystemSchema);
export default DesignSystem;
