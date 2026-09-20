import mongoose from 'mongoose';

const quotationCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, min: 0, default: 0 },
});

export default mongoose.model('QuotationCounter', quotationCounterSchema);
