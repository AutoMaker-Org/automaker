# Pipeline Troubleshooting Guide

## Common Issues and Solutions

### Pipeline Not Running

#### Symptoms

- Features complete but pipeline steps don't execute
- No pipeline progress shown in UI
- Steps remain in "pending" status

#### Possible Causes

1. **Pipeline Not Enabled**

   ```json
   // Check .automaker/pipeline.json
   {
     "enabled": true, // Must be true
     "steps": [...]
   }
   ```

2. **AutoTrigger Disabled**

   ```json
   {
     "id": "review",
     "autoTrigger": true, // Must be true for automatic execution
     "required": true
   }
   ```

3. **Auto Mode Not Running**
   - Check if Auto Mode service is active
   - Verify the auto mode loop is running
   - Check server logs for errors

#### Solutions

1. Go to **Settings → Pipeline** and enable the pipeline toggle
2. Edit the step and ensure `autoTrigger: true` is checked
3. Restart the Auto Mode service from the Terminal settings
4. Open browser dev tools (F12) and check the console for errors

### Steps Failing Unexpectedly

#### Symptoms

- Steps consistently fail with errors
- AI model responses are not being processed
- Generic "failed" status without details

#### Diagnosis

1. Check the step output in the UI
2. Review server logs for detailed error messages
3. Verify AI model availability

#### Common Issues

##### AI Model Unavailable

```
Error: Model 'opus' is not available
```

- Solution: Check model configuration and availability
- Try using a different model

##### Prompt Too Long

```
Error: Prompt exceeds maximum token limit
```

- Solution: Reduce the prompt size
- Exclude more files with patterns
- Use a model with higher token limit

##### Timeouts

```
Error: Step execution timed out
```

- Solution: Increase timeout in configuration
- Optimize prompts for faster execution
- Reduce analysis scope

### Performance Issues

#### Symptoms

- Pipeline execution is very slow
- High memory usage
- Browser becomes unresponsive

#### Optimization Strategies

1. **Reduce Analysis Scope**

   ```json
   {
     "config": {
       "excludePatterns": ["*.test.ts", "*.spec.ts", "node_modules/**", "dist/**", "*.min.js"]
     }
   }
   ```

2. **Use Faster Models**

   ```json
   {
     "model": "sonnet" // Instead of opus
   }
   ```

3. **Enable Parallel Execution**

   ```json
   {
     "parallel": true,
     "maxConcurrency": 3
   }
   ```

4. **Limit Issues Reported**
   ```json
   {
     "config": {
       "maxIssues": 5 // Instead of 10 or more
     }
   }
   ```

### Memory Issues

#### Symptoms

- Out of memory errors
- Slow performance over time
- Large storage usage

#### Solutions

1. **Clear Old Results**

   ```bash
   # Via API
   POST /api/pipeline/cleanup
   ```

2. **Disable Memory for Steps**

   ```json
   {
     "memoryEnabled": false
   }
   ```

3. **Enable Compression**
   ```javascript
   // In pipeline-storage.ts
   const storage = new PipelineStorage(dataDir, {
     compressionThreshold: 512, // Lower threshold
     maxResultSize: 5 * 1024 * 1024, // 5MB limit
   });
   ```

### Configuration Errors

#### Symptoms

- "Invalid configuration" errors
- Steps not showing up in UI
- Cannot save pipeline settings

#### Common Validation Errors

##### Duplicate Step IDs

```
Error: duplicate step id "review"
```

- Solution: Use unique IDs for each step

##### Invalid Step Type

```
Error: type must be one of: review, security, performance, test, custom
```

- Solution: Use valid step type

##### Missing Required Fields

```
Error: version is required
Error: name is required
```

- Solution: Add all required fields

##### Invalid Step Configuration

```
Error: test coverageThreshold must be between 0 and 100
```

- Solution: Fix the specific configuration error

### Integration Issues

#### CodeRabbit Not Working

1. **API Key Missing**

   ```json
   {
     "config": {
       "coderabbitEnabled": true,
       "coderabbitApiKey": "your-api-key" // Add this
     }
   }
   ```

2. **Network Issues**
   - Check firewall settings
   - Verify API endpoint is accessible
   - Check CORS configuration

#### WebSocket Events Not Received

1. **Authentication Issues**

   ```javascript
   // Ensure token is sent with WebSocket
   const ws = new WebSocket(url, {
     headers: {
       Authorization: `Bearer ${token}`,
     },
   });
   ```

2. **Event Subscription**
   ```javascript
   // Subscribe to pipeline events
   ws.send(
     JSON.stringify({
       type: 'subscribe',
       channel: 'pipeline',
     })
   );
   ```

### Debugging Tips

#### 1. Enable Debug Logging

```bash
# Set environment variable
DEBUG=automaker:pipeline* npm run dev
```

#### 2. Check Pipeline Status

```bash
# Get current status
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3330/api/pipeline/status
```

#### 3. Inspect Feature Files

```bash
# View pipeline steps in feature
cat .automaker/features/feature-id/feature.json | jq '.pipelineSteps'
```

#### 4. Monitor Queue

```bash
# Check queue status
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3330/api/pipeline/queue
```

#### 5. Test Individual Steps

```bash
# Execute step manually
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"featureId": "xxx", "stepId": "review"}' \
  http://localhost:3330/api/pipeline/execute-step
```

### Error Codes Reference

| Code | Description           | Solution                    |
| ---- | --------------------- | --------------------------- |
| P001 | Pipeline not enabled  | Enable pipeline in settings |
| P002 | Invalid configuration | Fix validation errors       |
| P003 | Step not found        | Check step ID exists        |
| P004 | Feature not found     | Verify feature ID           |
| P005 | Model unavailable     | Check model configuration   |
| P006 | Prompt too long       | Reduce prompt size          |
| P007 | Execution timeout     | Increase timeout            |
| P008 | Memory exceeded       | Reduce result size          |
| P009 | Unauthorized          | Check authentication        |
| P010 | Rate limited          | Wait and retry              |

### Performance Monitoring

#### Metrics to Track

1. **Execution Time**
   - Average: 30-60 seconds per step
   - Warning: > 2 minutes
   - Critical: > 5 minutes

2. **Token Usage**
   - Review: ~2000 tokens
   - Security: ~3000 tokens
   - Performance: ~2500 tokens
   - Test: ~1500 tokens

3. **Success Rate**
   - Target: > 90%
   - Warning: < 80%
   - Critical: < 70%

#### Monitoring Commands

```bash
# Get pipeline metrics
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3330/api/pipeline/metrics

# Get execution history
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3330/api/pipeline/history
```

### Recovery Procedures

#### Restore from Backup

```bash
# List backups
ls .automaker/backups/

# Restore specific backup
cp -r .automaker/backups/backup-2024-01-01/* .automaker/
```

#### Reset Pipeline

```bash
# Clear all pipeline results
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3330/api/pipeline/reset

# Reset specific feature
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"featureId": "xxx"}' \
  http://localhost:3330/api/pipeline/reset
```

### Getting Help

1. **Check Logs**
   - Server logs: `logs/automaker.log`
   - Pipeline logs: `logs/pipeline.log`
   - Error logs: `logs/errors.log`

2. **Community Support**
   - GitHub Issues: Report bugs
   - Discord: Real-time help
   - Documentation: Latest guides

3. **Contact Support**
   - Email: support@automaker.dev
   - Include: Configuration, logs, error details
   - Response time: 24-48 hours

### Prevention Checklist

- [ ] Regularly review and update pipeline configuration
- [ ] Monitor execution metrics and alerts
- [ ] Keep dependencies updated
- [ ] Test configuration changes in development
- [ ] Maintain backup of pipeline configuration
- [ ] Document custom steps and their purpose
- [ ] Review failed steps for patterns
- [ ] Optimize prompts for better performance
- [ ] Clean up old results periodically
- [ ] Train team on pipeline usage
