const fs = require('fs');
const csv = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const path = require('path');

// Get input file from command line arguments
const inputFile = process.argv[2];

if (!inputFile) {
    console.error('Please provide an input file path as an argument');
    console.error('Usage: node convert.js <input-file.csv>');
    process.exit(1);
}

// Generate output filename by adding _Testomatio before the extension
const parsedPath = path.parse(inputFile);
const outputFile = path.join(
    parsedPath.dir,
    `${parsedPath.name}_Testomatio${parsedPath.ext}`
);

function convertTestCases(inputFile, outputFile) {
    // Read and parse input CSV
    const inputData = fs.readFileSync(inputFile, 'utf-8');
    const lines = inputData.split('\n');
    // Define required columns
    // Find the header row index by looking for required columns
    const requiredColumns = ['Case ID', 'Case', 'Folder'];
    let headerRowIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        const row = lines[i];
        const columns = row.split(/[,;]/).map(col => col.trim().replace(/^["']|["']$/g, ''));

        // Check if all required columns are present in this row
        if (requiredColumns.every(col => columns.map(c => c.trim()).includes(col))) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        console.error('Could not find header row with required columns:', requiredColumns.join(', '));
        console.log('Columns found:', lines[0])
        process.exit(1);
    }

    // Get actual CSV data starting from the header row
    const csvData = lines.slice(headerRowIndex).join('\n');

    // Parse the CSV data
    const records = csv.parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
    });

    // Transform the data
    const transformedData = records.map(record => {
      // Trim all keys in the record object
      record = Object.keys(record).reduce((acc, key) => {
        acc[key.trim()] = record[key];
        return acc;
      }, {});

      return {
          'ID': `${record['Case ID'].toString().padStart(8, '0')}`,  // Generate 8-char ID with leading zeros
          'Title': record['Case'],
          'Status': 'manual',  // Default to manual since we're ignoring automation status
          'Folder': record['Folder'],
          'Emoji': '',
          'Priority': mapPriority(record['Priority']),
          'Tags': record['Tags'],
          'Owner': record['Created by'],
          'Description': formatDescription(record),
          'Labels': record['Test Type'] || '',  // Using Test Type as Labels
      };
    });

    console.log(`${transformedData.length} test cases processed`)

    // Write to output CSV
    const output = stringify(transformedData, {
        header: true,
        columns: [
            'ID', 'Title', 'Status', 'Folder', 'Emoji', 'Priority',
            'Tags', 'Owner', 'Description', 'Labels'
        ]
    });

    fs.writeFileSync(outputFile, output);
    console.log(`Conversion complete. Output written to ${outputFile}`);
}

function mapPriority(priority) {
    const priorityMap = {
        'P0-Critical': 'high',
        'P1-High': 'high',
        'P2-Medium': 'normal',
        'P3-Moderate': 'normal',
        'P4-Low': 'low'
    };
    return priorityMap[priority] || 'normal';
}

try {
    convertTestCases(inputFile, outputFile);
} catch (error) {
    console.error('Error during conversion:', error.message);
    console.log(error.stack)
}

function cleanHtml(text) {
    if (!text) return '';
    return text
        .replace(/<br\s*\/?>/gi, '\n')  // Replace <br> with newline
        .replace(/<(ul|ol)>((.*?)<\/\1>)/gi, (_, tag, content) => {
            const items = content.match(/<li.*?>(.*?)<\/li>/gi) || [];
            return '\n' + items.map(item => {
                const text = item.replace(/<li.*?>(.*?)<\/li>/gi, '$1').trim();
                return (tag === 'ul' ? '* ' : '1. ') + text;
            }).join('\n');
        }).replace(/<li.*?>(.*?)<\/li>/gi, '$1')  // Remove any remaining li tags
        .replace(/<\/?(p|span|div|ul|ol)[^>]*>/gi, '') // Remove p, ul, li tags
        .replace(/\n\s*\n/g, '\n')  // Remove multiple newlines
        .trim();
}

function formatDescription(record) {
    const parts = [];

    // Add precondition if exists
    if (record['Pre-condition']) {
        parts.push('## Precondition\n');
        parts.push(cleanHtml(record['Pre-condition']));
    }

    // Add description
    if (record['Description']) {
        if (parts.length > 0) parts.push('\n');
        parts.push('## Description\n');
        parts.push(cleanHtml(record['Description']));
    }

    // Add expected results if they exist
    if (record['Expected']) {
        if (parts.length > 0) parts.push('\n');
        parts.push('## Expected Results\n');
        parts.push(cleanHtml(record['Expected']));
    }

    return parts.join('\n');
}
