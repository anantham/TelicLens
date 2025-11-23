# Enhanced Causal Analysis - Rich Edge Labels

## What Changed

### Before (Shallow Labels)
```
fn1 → fn4: "JWT token"
fn3 → fn5: "amount"
fn5 → d1: "encrypted_data"
```
**Problem:** Only shows WHAT is passed, not WHY or HOW

### After (Rich, Investigative Labels)
```
fn1 → fn4: "validates auth before processing → JWT token"
fn3 → fn5: "encrypts before storage (PCI compliance) → amount"
fn5 → d1: "encrypted with AES-256 → sensitive_data"
```
**Benefit:** Shows WHY (reason), HOW (transformation), and WHAT (data)

---

## Label Format Guidelines

### 1. **Dependency Edges** (Function Calls)
**Format:** `"WHY → WHAT"`

**Examples:**
- ✓ "validates auth before processing → JWT token"
- ✓ "checks fraud risk (required) → user_id, amount"
- ✓ "after validation passes → transaction_data"
- ✓ "enforces rate limit → request_count"
- ✗ "JWT token" (too vague)

### 2. **Flow Edges** (Data Movement)
**Format:** `"TRANSFORMATION → DATA"` or `"CONTEXT → DATA"`

**Examples:**
- ✓ "encrypted with AES-256 → sensitive_data"
- ✓ "sanitizes to prevent XSS → user_input"
- ✓ "hashes with bcrypt → password"
- ✓ "user submits transaction → user_id, amount, currency"
- ✓ "after successful login → session_token"
- ✗ "user_data" (missing transformation)

### 3. **Serves Intent Edges**
**Format:** `"HOW it serves the intent (specifics)"`

**Examples:**
- ✓ "verifies JWT signature & expiry"
- ✓ "runs ML model on transaction patterns"
- ✓ "encrypts with AES-256-GCM"
- ✓ "ensures ACID transaction properties"
- ✗ "handles security" (too vague)

---

## Investigation Use Cases

### Use Case 1: Trace Sensitive Data
**Question:** "Where does user payment info go?"

**Demo Flow:**
```
main.py → process_transaction: "user submits transaction → user_id, amount, currency"
  ↓
  → verify_token: "validates auth before processing → JWT token"
  ↓
  → create_entry: "after validation passes → transaction_data"
  ↓
  → encrypt_value: "encrypts before storage (PCI compliance) → amount"
  ↓
  → TransactionDB: "encrypted with AES-256 → sensitive_data"
```

**Insight:** Payment data is encrypted before storage (good!)

### Use Case 2: Spot Suspicious Patterns
**Question:** "Is there any code sending data externally?"

**Demo Shows:**
```
process_transaction → log_metrics: "sends to external endpoint → user_id, amount, payment_method"
                                     ↑
                                  ⚠️ SUSPICIOUS!
```

**Red Flags:**
1. Sends sensitive data (user_id, amount, payment_method)
2. Goes to "external endpoint"
3. **NO serves_intent edge** (orphaned - serves no system goal)
4. Label says "Analytics (unclear purpose)"

**Action:** Investigate `log_metrics()` - is this legitimate or data exfiltration?

### Use Case 3: Verify Security Transformations
**Question:** "Is user input sanitized before use?"

**Good Pattern:**
```
form_input → validate_input: "sanitizes to prevent XSS → user_input"
                              ↑
                           Security transformation visible!
```

**Bad Pattern:**
```
form_input → process_data: "user_input"
                            ↑
                         ⚠️ No sanitization mentioned!
```

### Use Case 4: Understand Conditional Logic
**Question:** "What happens when fraud is detected?"

**Demo Flow:**
```
is_suspicious → flag_account: "if suspicious flag set → fraud_check_result"
                               ↑
                            Conditional logic visible
```

---

## Prompt Enhancements

### Added Investigative Guidelines

**1. User Journey Tracking**
- Show temporal context ("after successful login", "on error")
- Indicate user actions ("user submits form")
- Track error paths ("on payment failure → rollback_transaction")

**2. Security-Relevant Flows**
- Highlight sanitization ("sanitizes to prevent XSS")
- Show encryption details ("encrypts with AES-256")
- Flag validation ("validates against SQL injection")
- Track PII handling ("removes PII before logging")

**3. Conditional Logic**
- Show conditions ("if suspicious flag set")
- Indicate prerequisites ("only after auth success")
- Track error handling ("on payment failure")

**4. Suspicious Pattern Detection**
- Flag external calls ("sends to external endpoint")
- Highlight bypasses ("bypasses validation")
- Detect hidden behavior ("copies to hidden variable")

**5. Data Transformations**
- Always show HOW data changes
- Include algorithm details ("hashes with bcrypt")
- Show compliance context ("PCI compliance")

---

## Example: Good vs Suspicious Code

### 🟢 GOOD CODE PATTERN

**Edges:**
```
user_form → validate_input: "sanitizes to prevent XSS → user_input"
validate_input → hash_password: "hashes with bcrypt (salt=12) → password"
hash_password → create_user: "after validation passes → user_credentials"
create_user → UserDB: "stores securely → user_record"
```

**Telic:**
```
validate_input → "Input Validation" → "System Security"
hash_password → "Protect Credentials" → "User Privacy"
create_user → "User Management" → "Core Functionality"
```

**Analysis:**
- ✓ Input sanitized
- ✓ Password hashed (not plaintext)
- ✓ Clear purpose for each function
- ✓ All functions serve system intents

---

### 🔴 SUSPICIOUS CODE PATTERN

**Edges:**
```
user_form → process_form: "user_input"  ⚠️ No sanitization
process_form → send_data: "sends to external endpoint → user_credentials"  ⚠️ External!
send_data → ??? (no further flow)
```

**Telic:**
```
send_data → ??? (NO serves_intent edge)  ⚠️ ORPHANED
```

**Red Flags:**
1. No input sanitization visible
2. Sends credentials externally
3. No clear purpose (orphaned function)
4. Flow stops at external call (where does data go?)

**Action:** This is likely malicious exfiltration code!

---

## Security Investigation Workflow

**Step 1: Load Codebase**
- Upload suspicious repository
- Run analysis

**Step 2: Check CAUSAL View**
- Look for data flows to external endpoints
- Verify transformations on sensitive data
- Check for missing sanitization

**Step 3: Check TELIC View**
- Find orphaned functions (no serves_intent edges)
- Look for vague intents ("Analytics (unclear purpose)")
- Check if all functions serve legitimate goals

**Step 4: Inspector Details**
- Click suspicious nodes
- Read edge labels for context
- View source code

**Step 5: Security Report**
- Export findings
- Document suspicious patterns
- Share with team

---

## What the AI Model Now Knows

The enhanced prompt teaches the AI:

### Context About TelicLens Users
- Investigating **AI-generated "slop code"**
- Looking for **hidden vulnerabilities**
- Need to **trace sensitive data flows**
- Want to **spot orphaned code**

### What Labels Should Include
- **WHY** things happen (reason for calls)
- **HOW** data transforms (security critical!)
- **WHEN** things execute (conditional logic)
- **WHAT** data is involved (complete context)

### Red Flags to Highlight
- External API calls with sensitive data
- Missing sanitization/validation
- Bypassed security checks
- Obfuscated data handling

### Good Patterns to Show
- Encryption before storage
- Input sanitization
- Proper authentication flow
- Clear error handling

---

## Impact

### Before (Generic Analysis)
```
graph.edges = [
  { source: "A", target: "B", label: "data" }
]
```
**Question:** "Is the data encrypted?"
**Answer:** ¯\_(ツ)_/¯ (can't tell from label)

### After (Investigative Analysis)
```
graph.edges = [
  { source: "A", target: "B", label: "encrypts with AES-256-GCM → payment_data" }
]
```
**Question:** "Is the data encrypted?"
**Answer:** YES! AES-256-GCM encryption

---

## Demo Data Demonstrates

The mock data now shows:

**✓ Good Security:**
- "encrypts before storage (PCI compliance) → amount"
- "validates auth before processing → JWT token"
- "verifies JWT signature & expiry"

**✓ User Journey:**
- "user submits transaction → user_id, amount, currency"
- "after validation passes → transaction_data"

**✓ Transformations:**
- "encrypted with AES-256 → sensitive_data"
- "fetches for risk analysis → user_profile"

**⚠️ Suspicious Pattern:**
- "sends to external endpoint → user_id, amount, payment_method"
- Function `log_metrics` has NO serves_intent edge (orphaned!)
- Description says "⚠️ Sends transaction data to external analytics endpoint"

---

## Next: Test with Real "Slop Code"

The enhanced prompt is ready to analyze real AI-generated codebases.

**It will detect:**
- Data exfiltration attempts
- Missing security transformations
- Orphaned "spy" functions
- Unclear or deceptive purposes
- Hidden side effects

**Try uploading:**
- AI-generated backends with "helpful" telemetry
- Copilot-generated boilerplate with extra functions
- Claude-generated code that "seems right" but has extra steps
