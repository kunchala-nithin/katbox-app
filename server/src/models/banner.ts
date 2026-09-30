import mongoose, { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
  titlePrimary: string;
  titleSecondary: string;
  tagline: string;
  badge: string;
  price?: string;
  unit?: string;
  imageUrl: string;
  cloudinaryPublicId: string;
  isComingSoon: boolean;
  isFullBanner: boolean;
  isActive: boolean;
  displayOrder: number;
  ctaAction?: string; // e.g. 'Catering', 'MealBox', 'QuickBites', 'Pickles'
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema: Schema = new Schema(
  {
    titlePrimary: { type: String, default: '' },
    titleSecondary: { type: String, default: '' },
    tagline: { type: String, default: '' },
    badge: { type: String, default: '' },
    price: { type: String, default: '' },
    unit: { type: String, default: '' },
    imageUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },
    isComingSoon: { type: Boolean, default: false },
    isFullBanner: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    ctaAction: { type: String, default: '' },
  },
  { timestamps: true }
);

BannerSchema.index({ displayOrder: 1, createdAt: -1 });

export default mongoose.model<IBanner>('Banner', BannerSchema);