export const inquiryCategories = [
  "account",
  "service",
  "place",
  "privacy",
  "other",
] as const;

export type InquiryCategory = (typeof inquiryCategories)[number];

export type CreateInquiryRequest = {
  category: InquiryCategory;
  subject: string;
  message: string;
  email?: string;
};

export type CreateInquiryResponse = {
  inquiry: {
    id: string;
    status: "pending";
    createdAt: string;
  };
};

export type UserInquiryItem = {
  id: string;
  category: InquiryCategory;
  subject: string;
  message: string;
  status: "pending" | "reviewing" | "answered" | "closed";
  adminResponse: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserInquiriesResponse = {
  inquiries: UserInquiryItem[];
};
