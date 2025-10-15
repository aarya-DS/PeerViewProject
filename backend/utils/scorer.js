const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (ext === '.pdf') {
    try {
      const data = await pdf(buffer);
      return data.text;
    } catch (err) {
      console.error('PDF Error:', err);
      return null;
    }
  } else if (['.txt', '.md'].includes(ext)) {
    return buffer.toString('utf-8');
  }
  return null;
}

function scoreProject(text) {
  if (!text || text.length < 10) {
    return {
      clarityScore: 1,
      creativityScore: 1,
      technicalityScore: 1,
      overallScore: 1.0,
      feedback: 'Description too short. Add more details about your idea!'
    };
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/).filter(w => w.length > 3); // Unique meaningful words
  const wordCount = words.length;
  const uniqueWords = new Set(words).size;

  // Keywords
  const clarityKeywords = ['problem', 'goal', 'user', 'solution', 'objective'];
  const creativityKeywords = ['innovative', 'unique', 'creative', 'new', 'original'];
  const techKeywords = ['database', 'api', 'code', 'algorithm', 'framework', 'mongodb', 'node', 'angular', 'mean'];

  const clarityHits = clarityKeywords.filter(kw => lowerText.includes(kw)).length;
  const creativityHits = creativityKeywords.filter(kw => lowerText.includes(kw)).length;
  const techHits = techKeywords.filter(kw => lowerText.includes(kw)).length;

  // Score Logic (1-5 based on thresholds)
  const clarityScore = Math.min(5, Math.max(1, Math.round((wordCount / 50) + (clarityHits * 0.5) + 1))); // Length + structure
  const creativityScore = Math.min(5, Math.max(1, Math.round((uniqueWords / 10) + (creativityHits * 1) + 1))); // Variety + buzzwords
  const technicalityScore = Math.min(5, Math.max(1, Math.round(techHits * 1 + (lowerText.includes('implement') ? 1 : 0) + 1))); // Tech terms
  const overallScore = ((clarityScore + creativityScore + technicalityScore) / 3).toFixed(1);

  // Feedback Generation (Rule-Based)
  let feedback = '';
  if (clarityScore < 3) feedback += '- Improve clarity: Define the problem and your target users.\n';
  if (creativityScore < 3) feedback += '- Boost creativity: Add what makes your idea stand out (e.g., unique features).\n';
  if (technicalityScore < 3) feedback += '- Enhance technicality: Mention tools/tech stack (e.g., MEAN for web apps).\n';
  if (clarityScore >= 4 && creativityScore >= 4) feedback += '- Strong idea! Consider prototyping to test feasibility.\n';
  if (feedback === '') feedback = 'Solid project—great balance of clarity, creativity, and tech!';

  return {
    clarityScore,
    creativityScore,
    technicalityScore,
    overallScore: parseFloat(overallScore),
    feedback: feedback.trim()
  };
}

module.exports = { scoreProject, extractTextFromFile };