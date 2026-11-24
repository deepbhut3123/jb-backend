import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'company-bank' },
  accountName: { type: String, trim: true, default: 'JB CORPORATION' },
  bankName: { type: String, trim: true, default: 'The Kalupur Commercial Co-op Bank Ltd' },
  accountNumber: { type: String, trim: true, default: '03920101971' },
  ifsc: { type: String, trim: true, uppercase: true, default: 'KCCB0KTW039' },
  branch: { type: String, trim: true, default: 'Kathwada, Ahmedabad' },
  upiId: { type: String, trim: true, default: 'jbcorporation2023@okaxis' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('BankSettings', schema);
