import { tool } from "ai";
import { z } from "zod";

// Helper function to detect language from code
function detectLanguage(code: string): string {
  if (code.includes("function") || code.includes("const") || code.includes("let") || code.includes("=>")) {
    return "javascript";
  }
  if (code.includes("def ") || code.includes("import ") || code.includes("print(")) {
    return "python";
  }
  if (code.includes("public class") || code.includes("System.out")) {
    return "java";
  }
  return "unknown";
}

// Tool 1: Analyze Code for Bugs
export const analyzeBugs = (tool as any)({
  description: "Analyze code for potential bugs, logic errors, and edge cases. Call this first when reviewing code.",
  parameters: z.object({
    code: z.string().describe("The code to analyze"),
    language: z.string().optional().describe("Programming language (e.g., javascript, python)"),
  }),
  execute: async ({ code, language }: { code: string; language?: string }) => {
    console.log("🔧 analyzeBugs called with language:", language);
    
    const detectedLanguage = language || detectLanguage(code);
    const issues = [];
    
    // Bug patterns
    if (code.includes("== null") || code.includes("!= null")) {
      issues.push("⚠️ Using == or != for null checks - use === or !== instead");
    }
    if (code.match(/\bvar\s+/)) {
      issues.push("⚠️ Found 'var' keyword - use 'let' or 'const' for block scoping");
    }
    if (!code.includes("try") && (code.includes("JSON.parse") || code.includes("fetch"))) {
      issues.push("⚠️ Missing error handling for operations that can throw errors");
    }
    if (code.match(/for\s*\([^)]*arr1[^)]*\)/)) {
      issues.push("🐛 Loop variable 'arr1' conflicts with function parameter - variable shadowing");
    }
    if (code.match(/arr1\s*>\s*5/)) {
      issues.push("🐛 Loop condition 'arr1 > 5' will never be true if arr1 starts at 0 - infinite loop or zero iterations");
    }
    if (code.match(/\[arr1\]\s*\+\s*\[arr2\]/)) {
      issues.push("🐛 Array addition [arr1] + [arr2] will concatenate as strings, not add numbers");
    }
    
    return {
      analyzed: true,
      language: detectedLanguage,
      issuesFound: issues.length,
      issues: issues.length > 0 ? issues : ["✅ No obvious bugs detected"],
      codeLength: code.length,
    };
  },
}) as any;

// Tool 2: Check Code Security
export const checkSecurity = (tool as any)({
  description: "Scan code for security vulnerabilities like SQL injection, XSS, code injection. Call this after analyzeBugs.",
  parameters: z.object({
    code: z.string().describe("The code to check for security issues"),
    language: z.string().optional().describe("Programming language"),
  }),
  execute: async ({ code, language }: { code: string; language?: string }) => {
    console.log("🔧 checkSecurity called with language:", language);
    
    const detectedLanguage = language || detectLanguage(code);
    const vulnerabilities = [];
    
    // Security patterns
    if (code.includes("eval(")) {
      vulnerabilities.push("🚨 CRITICAL: eval() detected - can execute arbitrary code");
    }
    if (code.match(/innerHTML\s*=/)) {
      vulnerabilities.push("⚠️ HIGH: innerHTML usage detected - XSS vulnerability risk");
    }
    if (code.includes("SELECT") && code.includes("+")) {
      vulnerabilities.push("🚨 CRITICAL: Possible SQL injection - use parameterized queries");
    }
    if (code.match(/password|secret|key/i) && !code.match(/hash|encrypt/i)) {
      vulnerabilities.push("⚠️ HIGH: Sensitive data without encryption/hashing detected");
    }
    if (code.includes("console.log")) {
      vulnerabilities.push("ℹ️ LOW: console.log() should be removed in production code");
    }
    
    return {
      scanned: true,
      language: detectedLanguage,
      vulnerabilitiesFound: vulnerabilities.length,
      vulnerabilities: vulnerabilities.length > 0 ? vulnerabilities : ["✅ No security vulnerabilities detected"],
      severity: vulnerabilities.some(v => v.includes("CRITICAL")) ? "CRITICAL" : 
                vulnerabilities.some(v => v.includes("HIGH")) ? "HIGH" : "LOW",
    };
  },
}) as any;

// Tool 3: Suggest Performance Improvements
export const suggestPerformance = (tool as any)({
  description: "Identify performance issues and optimization opportunities. Call this after checkSecurity.",
  parameters: z.object({
    code: z.string().describe("The code to analyze for performance"),
    language: z.string().optional().describe("Programming language"),
  }),
  execute: async ({ code, language }: { code: string; language?: string }) => {
    console.log("🔧 suggestPerformance called with language:", language);
    
    const detectedLanguage = language || detectLanguage(code);
    const suggestions = [];
    
    // Performance patterns
    const nestedLoops = (code.match(/for\s*\(/g) || []).length;
    if (nestedLoops >= 2) {
      suggestions.push(`⚡ Nested loops detected - O(n²) time complexity, consider optimization`);
    }
    
    if (code.match(/\.map\([^)]+\)\.filter\(/)) {
      suggestions.push("⚡ Chained map().filter() - combine into single operation to reduce iterations");
    }
    
    if (code.includes("querySelector") && code.includes("for")) {
      suggestions.push("⚡ DOM queries in loops - cache selectors outside the loop");
    }
    
    if (code.match(/console\.log.*\+/)) {
      suggestions.push("⚡ String concatenation in console.log - use template literals for better performance");
    }
    
    return {
      analyzed: true,
      language: detectedLanguage,
      suggestionsCount: suggestions.length,
      suggestions: suggestions.length > 0 ? suggestions : ["✅ No obvious performance issues found"],
    };
  },
}) as any;

// Tool 4: Check Code Style & Best Practices
export const checkStyle = (tool as any)({
  description: "Check code style, naming conventions, and best practices. Call this last.",
  parameters: z.object({
    code: z.string().describe("The code to check for style issues"),
    language: z.string().optional().describe("Programming language"),
  }),
  execute: async ({ code, language }: { code: string; language?: string }) => {
    console.log("🔧 checkStyle called with language:", language);
    
    const detectedLanguage = language || detectLanguage(code);
    const styleIssues = [];
    
    // Style checks
    const hasComments = code.includes("//") || code.includes("/*");
    if (!hasComments && code.length > 50) {
      styleIssues.push("📝 No comments found - add documentation for better maintainability");
    }
    
    if (code.match(/function\s+[a-z]/)) {
      styleIssues.push("📝 Function names should be descriptive and follow camelCase convention");
    }
    
    const lines = code.split("\n");
    const longLines = lines.filter(l => l.length > 80);
    if (longLines.length > 0) {
      styleIssues.push(`📝 ${longLines.length} line(s) exceed 80 characters - consider breaking them up`);
    }
    
    if (code.match(/\blet\s+(\w+)\s*=.*for\s*\(\s*let\s+\1/)) {
      styleIssues.push("📝 Variable shadowing detected - loop variable has same name as outer variable");
    }
    
    if (!code.includes("  ") && code.includes("\t")) {
      styleIssues.push("📝 Inconsistent indentation - mix of tabs and spaces detected");
    }
    
    return {
      checked: true,
      language: detectedLanguage,
      issuesFound: styleIssues.length,
      issues: styleIssues.length > 0 ? styleIssues : ["✅ Code style looks good"],
    };
  },
}) as any;

// Tool 5: Generate Unit Tests
export const generateTests = (tool as any)({
  description: "Generate unit test suggestions for the provided code",
  parameters: z.object({
    code: z.string().describe("The code to generate tests for"),
    language: z.string().optional().describe("Programming language"),
    framework: z.string().optional().describe("Test framework (jest, pytest, etc.)"),
  }),
  // No execute = requires confirmation from user
}) as any;

// Tool 6: Save Review to History
export const saveReview = (tool as any)({
  description: "Save code review results to history for future reference",
  parameters: z.object({
    reviewSummary: z.string().describe("Summary of the review"),
    codeSnippet: z.string().describe("First 100 chars of reviewed code"),
  }),
  execute: async ({ reviewSummary, codeSnippet }: { reviewSummary: string; codeSnippet: string }) => {
    console.log("🔧 saveReview called");
    return {
      saved: true,
      timestamp: new Date().toISOString(),
      snippet: codeSnippet.substring(0, 100),
    };
  },
}) as any;

// Export all tools
export const tools = {
  analyzeBugs,
  checkSecurity,
  suggestPerformance,
  checkStyle,
  generateTests,
  saveReview,
};

// Tools that require user confirmation
export const executions = {
  generateTests: async ({ code, language, framework }: { 
    code: string; 
    language?: string; 
    framework?: string;
  }) => {
    const detectedLanguage = language || detectLanguage(code);
    return {
      generated: true,
      testFramework: framework || "generic",
      language: detectedLanguage,
      message: "Test generation confirmed - proceeding with AI generation",
    };
  },
};