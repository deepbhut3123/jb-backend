import mongoose from 'mongoose';

const companyPersonSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 100 },
  role: { type: String, trim: true, maxlength: 100 },
  number: { type: String, trim: true, maxlength: 30 },
  email: { type: String, trim: true, lowercase: true, maxlength: 160 },
  // Kept temporarily so older records can be read and normalized by the API.
  contactNumber: { type: String, trim: true, maxlength: 30 },
  designation: { type: String, trim: true, maxlength: 100 },
  department: { type: String, trim: true, maxlength: 100 },
});

const leadSchema = new mongoose.Schema(
  {
    // Legacy standalone contact fields. New leads store contacts in companyPersons.
    name: { type: String, trim: true, maxlength: 100, default: '' },
    company: { type: String, trim: true, maxlength: 120 },
    address1: { type: String, trim: true, maxlength: 180 },
    address2: { type: String, trim: true, maxlength: 180 },
    area: { type: String, trim: true, maxlength: 100 },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    website: { type: String, trim: true, maxlength: 180 },
    customerType: { type: String, trim: true, maxlength: 60 },
    segment: { type: String, trim: true, maxlength: 60 },
    companyPersons: { type: [companyPersonSchema], default: [] },
    leadSource: { type: String, trim: true, maxlength: 60 },
    stage: { type: String, enum: ['New', 'Quotation', 'Followup', 'Performa-Invoice', 'Done', 'Lost'], default: 'New' },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 30 },
    whatsappIdentity: { type: String, unique: true, sparse: true },
    source: { type: String, trim: true, maxlength: 50, default: 'Website' },
    status: { type: String, enum: ['New', 'Quotation', 'Followup', 'Performa-Invoice', 'Done', 'Lost'], default: 'New' },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    nextFollowUp: { type: Date },
    followUps: [{ date: Date, description: { type: String, trim: true, maxlength: 1000 }, nextDate: Date }],
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export default mongoose.model('Lead', leadSchema);
