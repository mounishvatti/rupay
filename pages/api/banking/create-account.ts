import { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import prisma from "@/prisma/PrismaClient";
import { verifyJWT } from "@/pages/api/middleware/middleware"; // Ensure you have JWT verification middleware
import { z } from "zod";
import store from "@/store/store";

// Validation schema for creating a bank account
const createAccountSchema = z.object({
  bankName: z.string().min(1, "Bank name is required"),
  pin: z.number().min(1000, "Pin must be a 4-digit number").max(9999, "Pin must be a 4-digit number"),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify JWT token before proceeding with the logic
  await verifyJWT(req, res, async () => {
    // Only allow POST requests to create bank accounts
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method Not Allowed" });
    }

    // Parse and validate the request body
    try {
      const accountData = createAccountSchema.parse(req.body);

      // Retrieve the logged-in user information from the token (JWT)
      const userId = store.getState().user.userId;
      if (!userId) {
        return res.status(401).json({ message: "User not found" });
      }

      const username = store.getState().user.username;
      const upiid = `${username}${accountData.bankName}@rupay`;

      const hashedPin = await bcrypt.hash(accountData.pin.toString(), 10);

      // Ensure that the UPI ID is unique across all bank accounts
      const existingAccount = await prisma.userBankDetails.findUnique({
        where: {
          upiid: upiid,
        },
      });

      if (existingAccount) {
        return res.status(400).json({ message: "UPI ID already exists for another account" });
      }

      // Create the bank account record
      const bankAccount = await prisma.userBankDetails.create({
        data: {
          userId: userId,
          bankName: accountData.bankName,
          upiid: upiid,
          pin: hashedPin,
        },
      });

      return res.status(201).json({
        message: "Bank account created successfully",
        bankAccount,
      });
    } catch (error) {
      console.error("Error creating bank account:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation Error",
          errors: error.errors,
        });
      }
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });
}