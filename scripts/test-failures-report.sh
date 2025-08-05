#!/bin/bash

# Generate test failures report with Claude analysis
echo "Running test failures and generating report..."

# Run tests with clean output
CI=1 npm run test:failures -- --no-colors --verbose --ci --no-coverage --forceExit --detectOpenHandles=false > failures.txt 2>&1

# Check if failures.txt was created and has content
if [ -f "failures.txt" ] && [ -s "failures.txt" ]; then
    echo "Tests completed. Sending to Claude for analysis..."
    
    # Send to Claude for analysis
    cat failures.txt | claude --dangerously-skip-permissions 'make a report what is failing and possible options why is failing, i may did changes to project i need to identify which tests are failed because of test out of date and which failing because app works wrong. create md file with report'
    
    # Clean up
    rm failures.txt
    echo "Report generated and failures.txt cleaned up."
else
    echo "No failures.txt generated or file is empty"
fi