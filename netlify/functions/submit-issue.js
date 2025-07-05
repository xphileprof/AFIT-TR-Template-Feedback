// netlify/functions/submit-issue.js
const fetch = require('node-fetch'); // Netlify Functions include node-fetch by default

// Environment variables will be injected by Netlify
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER; // Your GitHub username
const REPO_NAME = process.env.GITHUB_REPO_NAME;   // The name of your Overleaf-synced repo
const SECRET_SUBMISSION_CODE = process.env.SECRET_SUBMISSION_CODE; // Your custom code

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { type, title, description, accessCode, recaptchaToken } = JSON.parse(event.body);

        // 1. Verify reCAPTCHA
        const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`;
        const recaptchaRes = await fetch(recaptchaVerifyUrl, { method: 'POST' });
        const recaptchaData = await recaptchaRes.json();

        if (!recaptchaData.success) {
            console.error('reCAPTCHA verification failed:', recaptchaData['error-codes']);
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'reCAPTCHA verification failed. Please try again.' }),
            };
        }

        // 2. Verify custom secret code
        if (accessCode !== SECRET_SUBMISSION_CODE) {
            // For security, avoid giving specific error about the code
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'Invalid code or reCAPTCHA. Please try again.' }),
            };
        }

        // 3. Construct issue body based on type and GitHub Issue Templates
        let issueTitle = '';
        let issueBody = '';
        let labels = [];

        // Markdown for GitHub Issue Template:
        // The template uses specific headings. We'll format the description to fit.
        if (type === 'Bug') {
            issueTitle = `${title}`; // Title will be taken as is
            issueBody = `### Describe the bug\n\n${description}\n\n`;
            issueBody += `### To Reproduce\n\n(Please provide steps here if not in main description)\n\n`;
            issueBody += `### Expected behavior\n\n(Please describe here if not in main description)\n\n`;
            issueBody += `### Actual behavior\n\n(Please describe here if not in main description)\n\n`;
            issueBody += `---\n\n_This issue was submitted via the public bug report form._`;
            labels.push('bug', 'status: new'); // Add default labels
        } else if (type === 'Feature') {
            issueTitle = `${title}`;
            issueBody = `### Is your feature request related to a problem? Please describe.\n\n${description}\n\n`;
            issueBody += `### Describe the solution you'd like\n\n(Please describe here if not in main description)\n\n`;
            issueBody += `### Describe alternatives you've considered\n\n(Please describe here if not in main description)\n\n`;
            issueBody += `---\n\n_This feature was submitted via the public feature request form._`;
            labels.push('enhancement', 'status: new'); // Add default labels
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid issue type.' }),
            };
        }


        // 4. Create GitHub Issue
        const githubApiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`;
        const githubRes = await fetch(githubApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Bug-Submission-Form-App' // GitHub requires a User-Agent
            },
            body: JSON.stringify({
                title: issueTitle,
                body: issueBody,
                labels: labels,
            }),
        });

        const githubData = await githubRes.json();

        if (githubRes.ok) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Issue created successfully!', issueUrl: githubData.html_url }),
            };
        } else {
            console.error('GitHub API error:', githubData);
            return {
                statusCode: githubRes.status,
                body: JSON.stringify({ message: `Failed to create GitHub issue: ${githubData.message || 'Unknown error'}` }),
            };
        }

    } catch (error) {
        console.error('Serverless function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error.' }),
        };
    }
};
