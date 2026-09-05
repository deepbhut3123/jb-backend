import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
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
    companyPersons: [{ name: { type: String, trim: true, maxlength: 100 }, email: { type: String, trim: true, lowercase: true, maxlength: 160 }, contactNumber: { type: String, trim: true, maxlength: 30 }, designation: { type: String, trim: true, maxlength: 100 }, department: { type: String, trim: true, maxlength: 100 } }],
    leadSource: { type: String, trim: true, maxlength: 60 },
    stage: { type: String, enum: ['New', 'Quotation', 'Followup', 'Performa-Invoice', 'Done', 'Lost'], default: 'New' },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 30 },
    source: { type: String, trim: true, maxlength: 50, default: 'Website' },
    status: { type: String, enum: ['New', 'Quotation', 'Followup', 'Performa-Invoice', 'Done', 'Lost'], default: 'New' },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    nextFollowUp: { type: Date },
    notes: { type: String, trim: true, maxlength: 1000 },
    followUps: [{ date: Date, description: { type: String, trim: true, maxlength: 1000 }, nextDate: Date }],
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export default mongoose.model('Lead', leadSchema);
