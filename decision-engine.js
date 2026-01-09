/**
 * CHOW Decision Engine
 * Calculates risk levels and generates action plans based on CHOW variables
 */

const DecisionEngine = {
    /**
     * Determine if the CHOW is in the past or future
     */
    getTiming(acquisitionDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const acqDate = new Date(acquisitionDate);
        acqDate.setHours(0, 0, 0, 0);
        return acqDate <= today ? 'past' : 'future';
    },

    /**
     * Calculate risk level based on all inputs
     *
     * Core principle: Risk = Financial Exposure × Likelihood of Loss
     * - If no exposure ($0 AR, no FBS), risk is LOW regardless of other factors
     * - Stock sale with contract = LOW (new owner committed and assumes debt)
     * - High risk requires BOTH exposure AND danger signals
     *
     * Returns: { level: 'high'|'medium'|'low', reasons: string[] }
     */
    calculateRisk(inputs) {
        const reasons = [];

        const timing = this.getTiming(inputs.acquisitionDate);
        const hasAR = inputs.outstandingAR === 'yes';
        const hasFBS = inputs.futureBookedShifts === 'yes';
        const hasExposure = hasAR || hasFBS; // Do we have money at stake?

        const contractSigned = inputs.contractSigned === 'yes';
        const noContract = inputs.contractSigned === 'no';
        const unknownContract = inputs.contractSigned === 'unknown';

        const isAssetSale = inputs.saleType === 'asset';
        const isStockSale = inputs.saleType === 'stock';
        const isUnknownSale = inputs.saleType === 'unknown';

        const hasDistress = inputs.financialDistress === 'yes';
        const unwillingToPay = inputs.willingnessToPay === 'no';
        const willingToPay = inputs.willingnessToPay === 'yes';

        const newOwnerBlacklisted = inputs.blacklisted === 'new' || inputs.blacklisted === 'both';
        const oldOwnerBlacklisted = inputs.blacklisted === 'old' || inputs.blacklisted === 'both';
        const inBadDebt = inputs.badDebt === 'yes';

        // ========================================
        // LOW RISK - Safe scenarios
        // ========================================

        // No financial exposure = nothing to lose
        if (!hasExposure) {
            reasons.push('No financial exposure ($0 AR, no future booked shifts)');
            if (newOwnerBlacklisted) {
                reasons.push('Note: New owner is blacklisted - relationship cannot continue');
                return { level: 'medium', reasons }; // Bump to medium due to relationship issue
            }
            return { level: 'low', reasons };
        }

        // Stock sale with signed contract = new owner is committed and assumes all debt
        if (isStockSale && contractSigned) {
            reasons.push('Stock sale with signed contract - new owner assumes debt and is committed');
            if (hasDistress) {
                reasons.push('Note: Financial distress signals present, but new owner has signed contract');
            }
            if (newOwnerBlacklisted) {
                reasons.push('Warning: New owner is blacklisted - escalate to collections team');
                return { level: 'high', reasons };
            }
            return { level: 'low', reasons };
        }

        // Future CHOW with contract signed = time + commitment
        if (timing === 'future' && contractSigned && !newOwnerBlacklisted) {
            reasons.push('Future CHOW with contract already signed - time to prepare');
            if (isAssetSale && hasAR) {
                reasons.push('Asset sale with AR - need to confirm old owner payment plan');
                return { level: 'medium', reasons };
            }
            return { level: 'low', reasons };
        }

        // ========================================
        // HIGH RISK - Exposure + danger signals
        // ========================================

        // Blacklisted new owner with any exposure
        if (newOwnerBlacklisted && hasExposure) {
            reasons.push('New owner is blacklisted with financial exposure - cannot safely continue');
            return { level: 'high', reasons };
        }

        // Past CHOW + no contract + exposure = already happened, no commitment, money at risk
        if (timing === 'past' && (noContract || unknownContract) && hasExposure) {
            reasons.push('Past CHOW with no contract and financial exposure');
            if (isUnknownSale) {
                reasons.push('Sale type unknown - cannot determine who is responsible for debt');
            }
            return { level: 'high', reasons };
        }

        // Asset sale + financial distress + AR = old owner unlikely to pay what they owe
        if (isAssetSale && hasDistress && hasAR) {
            reasons.push('Asset sale with financial distress and outstanding AR - old owner unlikely to pay');
            return { level: 'high', reasons };
        }

        // Explicit unwillingness to pay with AR exposure
        if (unwillingToPay && hasAR) {
            reasons.push('Responsible party indicates unwillingness to pay with outstanding AR');
            return { level: 'high', reasons };
        }

        // Unknown sale type with exposure = don't know who's responsible
        if (isUnknownSale && hasExposure && timing === 'past') {
            reasons.push('Past CHOW with unknown sale type - unclear who is responsible for debt');
            return { level: 'high', reasons };
        }

        // Bad debt + stock sale = new owner inheriting problem debt
        if (inBadDebt && isStockSale && !contractSigned) {
            reasons.push('Account in bad debt collections with stock sale and no new contract');
            return { level: 'high', reasons };
        }

        // ========================================
        // MEDIUM RISK - Exposure but manageable
        // ========================================

        // Future CHOW without contract but has exposure
        if (timing === 'future' && !contractSigned && hasExposure) {
            reasons.push('Future CHOW without signed contract but time to act');
            if (hasDistress && isAssetSale) {
                reasons.push('Financial distress with asset sale - prioritize securing new contract');
            }
            return { level: 'medium', reasons };
        }

        // Stock sale without contract (new owner would assume debt, but no commitment yet)
        if (isStockSale && !contractSigned && hasExposure) {
            reasons.push('Stock sale without contract - new owner would assume debt but needs to commit');
            return { level: 'medium', reasons };
        }

        // Asset sale with contract but AR to collect from old owner
        if (isAssetSale && contractSigned && hasAR) {
            reasons.push('Asset sale with contract - need to collect from old owner');
            if (hasDistress) {
                reasons.push('Financial distress signals - old owner may have difficulty paying');
                return { level: 'medium', reasons }; // Could be high, but contract protects new relationship
            }
            return { level: 'medium', reasons };
        }

        // Unknown willingness to pay with AR
        if (inputs.willingnessToPay === 'unknown' && hasAR) {
            reasons.push('Unknown willingness to pay with outstanding AR');
            return { level: 'medium', reasons };
        }

        // Old owner blacklisted (affects collection, not relationship)
        if (oldOwnerBlacklisted && hasAR && isAssetSale) {
            reasons.push('Old owner blacklisted - may affect collection of pre-sale debt');
            return { level: 'medium', reasons };
        }

        // Unknown contract status with exposure
        if (unknownContract && hasExposure) {
            reasons.push('Contract status unknown with financial exposure');
            return { level: 'medium', reasons };
        }

        // ========================================
        // DEFAULT - Standard handling
        // ========================================
        reasons.push('Standard CHOW scenario - follow normal process');
        return { level: 'medium', reasons };
    },

    /**
     * Generate scenario description string
     */
    generateScenarioDescription(inputs) {
        const timing = this.getTiming(inputs.acquisitionDate);
        const parts = [];

        parts.push(timing === 'past' ? 'Past CHOW' : 'Future CHOW');
        parts.push(inputs.saleType === 'asset' ? 'Asset Sale' :
                   inputs.saleType === 'stock' ? 'Stock Sale' : 'Unknown Sale Type');

        if (inputs.outstandingAR === 'yes') parts.push('Outstanding AR');
        if (inputs.futureBookedShifts === 'yes') parts.push('Has FBS');
        if (inputs.contractSigned === 'yes') parts.push('Contract Signed');
        else if (inputs.contractSigned === 'no') parts.push('No Contract');

        return parts.join(' | ');
    },

    /**
     * Generate key focus message based on scenario
     */
    generateKeyFocus(inputs, riskLevel) {
        const timing = this.getTiming(inputs.acquisitionDate);
        const hasAR = inputs.outstandingAR === 'yes';
        const hasFBS = inputs.futureBookedShifts === 'yes';
        const noContract = inputs.contractSigned === 'no' || inputs.contractSigned === 'unknown';
        const isAssetSale = inputs.saleType === 'asset';
        const isStockSale = inputs.saleType === 'stock';
        const hasDistress = inputs.financialDistress === 'yes';

        // Special case: No AR and no FBS
        if (!hasAR && !hasFBS) {
            return 'Low risk situation. No immediate financial exposure. Archive the old account and treat as standard new customer onboarding if they want to continue with Clipboard.';
        }

        // High risk scenarios
        if (riskLevel === 'high') {
            if (hasDistress) {
                return 'High-risk scenario. Old owner shows signs of financial distress and is unlikely to pay. Immediate action needed: PEND the account now, attempt contact to assess situation, and escalate to Charlie if no response.';
            }
            if (timing === 'past' && noContract && hasAR) {
                return 'High-risk scenario. Ownership already changed with no contract and money owed. PEND immediately. Call old and new owners to understand the situation and determine path forward. Focus on securing a new contract or shutting down services.';
            }
            if (inputs.blacklisted === 'new' || inputs.blacklisted === 'both') {
                return 'Critical: New owner is blacklisted. Check for upcoming shifts and inform collections team (Erick, Gayah, Mike Amicucci). Mike will assess risk and determine if services can continue.';
            }
            if (hasFBS && noContract) {
                return 'High-risk scenario. Future shifts are booked but no contract in place. PEND immediately to prevent additional exposure. Contact both parties urgently to clarify contract status.';
            }
        }

        // Medium risk scenarios
        if (riskLevel === 'medium') {
            if (timing === 'future' && isAssetSale && noContract && hasAR) {
                return 'Medium risk. CHOW is upcoming which gives time to act. Focus on confirming who is responsible for pre-sale debt and getting a new contract signed before the transition date.';
            }
            if (isAssetSale && inputs.contractSigned === 'yes' && hasAR) {
                return 'Medium risk. Contract is in place but pre-sale AR needs attention. Create new account for old entity, transfer pre-sale invoices, and establish clear payment expectations with old owner.';
            }
        }

        // Low risk / Stock sale scenarios
        if (isStockSale && inputs.contractSigned === 'yes') {
            return 'Stock sale with contract signed. New owner assumes all debt including pre-sale invoices. Update account information across platforms and confirm new owner understands payment expectations.';
        }

        if (isStockSale && noContract) {
            return 'Stock sale without contract. New owner would assume debt but needs to sign contract. PEND account until contract is secured. Focus on getting Sales to close the new contract.';
        }

        // Default
        return 'Gather remaining information, confirm financial responsibility, and coordinate with Sales on contract status.';
    },

    /**
     * Generate priority actions with confidence levels
     *
     * Confidence levels:
     * - HIGH: Clear-cut scenario, standard response, follow this
     * - MEDIUM: Reasonable approach but use judgment, context matters
     * - LOW: Unusual scenario, consider escalating, multiple valid paths
     *
     * Returns: Array of { text: string, confidence: 'high'|'medium'|'low' }
     */
    generatePriorityActions(inputs, riskLevel) {
        const actions = [];
        const timing = this.getTiming(inputs.acquisitionDate);
        const hasAR = inputs.outstandingAR === 'yes';
        const hasFBS = inputs.futureBookedShifts === 'yes';
        const hasExposure = hasAR || hasFBS;
        const contractSigned = inputs.contractSigned === 'yes';
        const noContract = inputs.contractSigned === 'no';
        const unknownContract = inputs.contractSigned === 'unknown';
        const isAssetSale = inputs.saleType === 'asset';
        const isStockSale = inputs.saleType === 'stock';
        const isUnknownSale = inputs.saleType === 'unknown';
        const hasDistress = inputs.financialDistress === 'yes';
        const newOwnerBlacklisted = inputs.blacklisted === 'new' || inputs.blacklisted === 'both';

        // ===========================================
        // NO EXPOSURE - Simple path
        // ===========================================
        if (!hasExposure) {
            actions.push({
                text: 'Alert leadership of the CHOW',
                confidence: 'high'
            });
            actions.push({
                text: 'Archive the account to prevent posting under new ownership without contract',
                confidence: 'high'
            });
            if (newOwnerBlacklisted) {
                actions.push({
                    text: 'Inform collections team - new owner is blacklisted, relationship cannot continue',
                    confidence: 'high'
                });
            } else {
                actions.push({
                    text: 'Sales treats this as standard new customer onboarding if they want to continue',
                    confidence: 'high'
                });
            }
            return actions;
        }

        // ===========================================
        // BLACKLISTED NEW OWNER - Escalate immediately
        // ===========================================
        if (newOwnerBlacklisted) {
            actions.push({
                text: 'Check CBH App for upcoming shifts at affected facilities and document them',
                confidence: 'high'
            });
            actions.push({
                text: 'Inform Erick, Gayah, and Mike Amicucci in #collections-team immediately',
                confidence: 'high'
            });
            actions.push({
                text: 'Wait for Mike to assess risk and determine if services can continue',
                confidence: 'high'
            });
            return actions;
        }

        // ===========================================
        // HIGH RISK scenarios
        // ===========================================
        if (riskLevel === 'high') {
            // Past CHOW with no contract
            if (timing === 'past' && (noContract || unknownContract)) {
                actions.push({
                    text: 'PEND account immediately using "Change of ownership" reason',
                    confidence: 'high'
                });
                actions.push({
                    text: 'Call old and new owners to assess situation and gather information',
                    confidence: 'high'
                });
                if (hasFBS) {
                    actions.push({
                        text: 'If no response within 24-48 hours, consider SUSPEND to prevent further exposure',
                        confidence: 'medium'
                    });
                }
                actions.push({
                    text: 'Alert Sales about potential new contract opportunity',
                    confidence: 'high'
                });
                return actions;
            }

            // Asset sale with financial distress
            if (isAssetSale && hasDistress && hasAR) {
                actions.push({
                    text: 'PEND account - old owner in distress unlikely to pay pre-sale debt',
                    confidence: 'high'
                });
                actions.push({
                    text: 'Attempt contact with old owner to understand their situation and payment ability',
                    confidence: 'medium'
                });
                actions.push({
                    text: 'Prioritize getting new contract signed to protect ongoing relationship',
                    confidence: 'high'
                });
                actions.push({
                    text: 'Consider escalating to Charlie if old owner is completely unresponsive',
                    confidence: 'medium'
                });
                return actions;
            }

            // Unknown sale type
            if (isUnknownSale) {
                actions.push({
                    text: 'URGENT: Determine sale type (asset vs stock) - this determines who owes the debt',
                    confidence: 'high'
                });
                actions.push({
                    text: 'PEND account until sale type is confirmed',
                    confidence: 'high'
                });
                actions.push({
                    text: 'Contact both old and new owners to clarify transaction structure',
                    confidence: 'medium'
                });
                return actions;
            }

            // Generic high risk fallback
            actions.push({
                text: 'PEND account to prevent additional exposure',
                confidence: 'high'
            });
            actions.push({
                text: 'Escalate to leadership for guidance on approach',
                confidence: 'medium'
            });
            actions.push({
                text: 'Attempt contact with responsible party to assess payment likelihood',
                confidence: 'medium'
            });
            return actions;
        }

        // ===========================================
        // MEDIUM RISK scenarios
        // ===========================================
        if (riskLevel === 'medium') {
            // Future CHOW - we have time
            if (timing === 'future') {
                if (!contractSigned) {
                    actions.push({
                        text: 'Work with Sales to get new contract signed before transition date',
                        confidence: 'high'
                    });
                }
                if (isAssetSale && hasAR) {
                    actions.push({
                        text: 'Confirm with old owner they understand responsibility for pre-sale invoices',
                        confidence: 'high'
                    });
                    actions.push({
                        text: 'Establish payment timeline with old owner before transition',
                        confidence: 'medium'
                    });
                }
                if (isUnknownSale) {
                    actions.push({
                        text: 'Determine sale type before transition to clarify debt responsibility',
                        confidence: 'high'
                    });
                }
                if (isStockSale) {
                    actions.push({
                        text: 'Confirm new owner understands they will assume all outstanding debt',
                        confidence: 'high'
                    });
                }
                return actions;
            }

            // Stock sale without contract
            if (isStockSale && !contractSigned) {
                actions.push({
                    text: 'PEND account until new contract is signed',
                    confidence: 'high'
                });
                actions.push({
                    text: 'New owner would assume debt - focus on getting contract signed quickly',
                    confidence: 'high'
                });
                actions.push({
                    text: 'Alert Sales to prioritize this contract',
                    confidence: 'medium'
                });
                return actions;
            }

            // Asset sale with contract - need to collect from old owner
            if (isAssetSale && contractSigned && hasAR) {
                actions.push({
                    text: 'Create new account for old entity to track pre-sale invoices separately',
                    confidence: 'high'
                });
                actions.push({
                    text: 'Transfer pre-sale invoices to old entity account',
                    confidence: 'high'
                });
                actions.push({
                    text: 'Establish payment plan with old owner for pre-sale debt',
                    confidence: 'medium'
                });
                if (hasDistress) {
                    actions.push({
                        text: 'Monitor old owner closely - distress signals present',
                        confidence: 'medium'
                    });
                }
                return actions;
            }

            // Default medium risk
            actions.push({
                text: 'Confirm financial responsibility with appropriate party',
                confidence: 'medium'
            });
            actions.push({
                text: 'Coordinate with Sales on contract and account setup',
                confidence: 'medium'
            });
            actions.push({
                text: 'Consider PEND if situation is unclear - use your judgment',
                confidence: 'low'
            });
            return actions;
        }

        // ===========================================
        // LOW RISK scenarios
        // ===========================================

        // Stock sale with contract - smoothest path
        if (isStockSale && contractSigned) {
            actions.push({
                text: 'Update account information across all platforms (Salesforce, CBH App, Invoiced)',
                confidence: 'high'
            });
            actions.push({
                text: 'Confirm new owner understands they assume all outstanding debt',
                confidence: 'high'
            });
            actions.push({
                text: 'Verify and update all child facility links',
                confidence: 'high'
            });
            return actions;
        }

        // Future with contract
        if (timing === 'future' && contractSigned) {
            actions.push({
                text: 'Coordinate transition plan with Sales and new owner',
                confidence: 'high'
            });
            if (isAssetSale && hasAR) {
                actions.push({
                    text: 'Confirm old owner payment plan for pre-sale invoices',
                    confidence: 'medium'
                });
            }
            actions.push({
                text: 'Prepare account updates for transition date',
                confidence: 'high'
            });
            return actions;
        }

        // Default low risk
        actions.push({
            text: 'Follow standard CHOW process - situation is low risk',
            confidence: 'high'
        });
        actions.push({
            text: 'Confirm payment expectations with responsible party',
            confidence: 'medium'
        });
        actions.push({
            text: 'Tag leadership in Slack for visibility',
            confidence: 'high'
        });
        return actions;
    },

    /**
     * Generate staged checklist
     */
    generateChecklist(inputs, riskLevel) {
        const timing = this.getTiming(inputs.acquisitionDate);
        const hasAR = inputs.outstandingAR === 'yes';
        const hasFBS = inputs.futureBookedShifts === 'yes';
        const noContract = inputs.contractSigned === 'no' || inputs.contractSigned === 'unknown';
        const contractSigned = inputs.contractSigned === 'yes';
        const isAssetSale = inputs.saleType === 'asset';
        const isStockSale = inputs.saleType === 'stock';
        const isUnknownSale = inputs.saleType === 'unknown';
        const hasDistress = inputs.financialDistress === 'yes';
        const inBadDebt = inputs.badDebt === 'yes';

        const checklist = {
            stage1: [],
            stage2: [],
            stage3: [],
            stage4: []
        };

        // ===================
        // STAGE 1: Pre-Outreach
        // ===================

        // Items already answered via form - mark as completed
        checklist.stage1.push({
            text: 'Confirm outstanding AR status',
            completed: true,
            note: hasAR ? 'Yes - has outstanding AR' : 'No outstanding AR'
        });

        checklist.stage1.push({
            text: 'Confirm future booked shifts (FBS)',
            completed: true,
            note: hasFBS ? 'Yes - has FBS' : 'No FBS'
        });

        checklist.stage1.push({
            text: 'Confirm acquisition date and timing',
            completed: true,
            note: timing === 'past' ? 'PAST' : 'FUTURE'
        });

        checklist.stage1.push({
            text: 'Determine sale type',
            completed: true,
            note: inputs.saleType.toUpperCase()
        });

        // Items to still do
        if (!inBadDebt) {
            checklist.stage1.push({
                text: 'Check if account is in bad debt collections',
                completed: inputs.badDebt === 'no'
            });
        } else {
            checklist.stage1.push({
                text: 'Check if account is in bad debt collections',
                completed: true,
                note: 'YES - in bad debt'
            });
        }

        // ===================
        // STAGE 2: Outreach
        // ===================

        if (isAssetSale || isUnknownSale) {
            checklist.stage2.push({
                text: 'Confirm financial responsibility with old owner for pre-sale invoices',
                completed: false,
                label: 'billing'
            });
        }

        if (isStockSale) {
            checklist.stage2.push({
                text: 'Confirm new owner understands they assume all outstanding debt',
                completed: false,
                label: 'billing'
            });
        }

        checklist.stage2.push({
            text: 'Confirm all payers know when we expect next payment',
            completed: false,
            label: 'billing'
        });

        if (hasDistress || inputs.financialDistress === 'unknown') {
            checklist.stage2.push({
                text: 'Investigate signs of financial distress from responsible owner',
                completed: hasDistress,
                note: hasDistress ? 'Already indicated: YES' : null,
                label: 'billing'
            });
        }

        if (noContract) {
            checklist.stage2.push({
                text: 'Sales: Get new contract signed with new ownership',
                completed: false,
                label: 'sales'
            });
        } else {
            checklist.stage2.push({
                text: 'Confirm contract is in place with Sales',
                completed: contractSigned,
                label: 'sales'
            });
        }

        checklist.stage2.push({
            text: 'Request proof of ownership change documentation',
            completed: false,
            label: 'billing'
        });

        // ===================
        // STAGE 3: Post-Outreach
        // ===================

        checklist.stage3.push({
            text: 'Once financial responsibility confirmed, tag leadership for re-enrollment decision',
            completed: false,
            label: 'escalate'
        });

        if (isAssetSale) {
            checklist.stage3.push({
                text: 'Sales: Create new parent account for acquiring entity across all platforms',
                completed: false,
                label: 'sales'
            });

            checklist.stage3.push({
                text: 'Sales: Mark old parent account as inactive (unless other active facilities remain)',
                completed: false,
                label: 'sales'
            });

            if (hasAR || hasFBS) {
                checklist.stage3.push({
                    text: 'Transfer pre-sale invoices/shifts to old entity account',
                    completed: false,
                    label: 'billing'
                });
            }
        }

        if (isStockSale) {
            checklist.stage3.push({
                text: 'Sales: Update existing parent account info across all platforms',
                completed: false,
                label: 'sales'
            });

            checklist.stage3.push({
                text: 'Sales: Verify and update all child facility links',
                completed: false,
                label: 'sales'
            });
        }

        checklist.stage3.push({
            text: 'Sales: Adjust charge rates as necessary',
            completed: false,
            label: 'sales'
        });

        if (hasAR && isAssetSale) {
            checklist.stage3.push({
                text: 'Notify @cash-ops-team of transferred invoices (include list, partial payments, credit notes)',
                completed: false,
                label: 'billing'
            });
        }

        // Bad debt specific
        if (inBadDebt && isStockSale) {
            checklist.stage3.push({
                text: 'Tag bad debt team in #collections-team about acquisition (stock sale = new owner takes debt)',
                completed: false,
                label: 'escalate'
            });

            checklist.stage3.push({
                text: 'Wait for Kelly approval before re-enrolling',
                completed: false,
                label: 'escalate'
            });
        }

        // ===================
        // STAGE 4: Continuous
        // ===================

        if (hasAR) {
            checklist.stage4.push({
                text: 'Continue chasing responsible party for pre-CHOW invoices',
                completed: false,
                label: 'billing'
            });

            checklist.stage4.push({
                text: 'Monitor for payment commitments and follow up',
                completed: false,
                label: 'billing'
            });

            if (isAssetSale) {
                checklist.stage4.push({
                    text: 'Archive old account once all invoices paid',
                    completed: false,
                    label: 'billing'
                });
            }
        }

        // Special case: no AR, no FBS
        if (!hasAR && !hasFBS) {
            // Clear most items, simplify
            checklist.stage2 = [{
                text: 'Coordinate with Sales on new customer onboarding (if applicable)',
                completed: false,
                label: 'sales'
            }];
            checklist.stage3 = [{
                text: 'Archive old account',
                completed: false,
                label: 'billing'
            }];
            checklist.stage4 = [{
                text: 'No ongoing collection needed - $0 AR',
                completed: true
            }];
        }

        return checklist;
    },

    /**
     * Generate special alerts
     */
    generateAlerts(inputs) {
        const alerts = [];

        if (inputs.blacklisted === 'new' || inputs.blacklisted === 'both') {
            alerts.push({
                type: 'critical',
                text: 'NEW OWNER IS BLACKLISTED: Must inform Erick, Gayah, and Mike Amicucci in #collections-team before proceeding. Mike will determine if services can continue.'
            });
        }

        if (inputs.blacklisted === 'old') {
            alerts.push({
                type: 'warning',
                text: 'Old owner is blacklisted. If facility was previously blacklisted, follow Process of Reinstatement SOP. Accounts with debt under $5k and reliable payment history may be reinstated.'
            });
        }

        if (inputs.badDebt === 'yes') {
            alerts.push({
                type: 'warning',
                text: 'Account is in Bad Debt (Handled by Internet Bad Debts Collections). Additional steps required before re-enrollment - see Bad Debt section of SOP.'
            });
        }

        if (inputs.financialDistress === 'yes') {
            alerts.push({
                type: 'warning',
                text: 'Financial distress signals detected. Higher risk of non-payment. Consider escalating to Charlie for guidance on approach.'
            });
        }

        return alerts;
    },

    /**
     * Format output for Linear (markdown)
     */
    formatForLinear(inputs, risk, checklist, priorityActions, alerts) {
        const timing = this.getTiming(inputs.acquisitionDate);
        let output = '';

        // Header info
        output += `## CHOW Details\n`;
        output += `**Old Owner:** ${inputs.oldOwnerName}\n`;
        output += `**New Owner:** ${inputs.newOwnerName}\n`;
        output += `**Affected Facilities:**\n${inputs.affectedFacilities.split('\n').map(f => `- ${f.trim()}`).join('\n')}\n`;
        if (inputs.newFacilityNames) {
            output += `**New Facility Names:**\n${inputs.newFacilityNames.split('\n').map(f => `- ${f.trim()}`).join('\n')}\n`;
        }
        output += `**Acquisition Date:** ${inputs.acquisitionDate} (${timing.toUpperCase()})\n`;
        output += `**Sale Type:** ${inputs.saleType.toUpperCase()}\n`;
        if (inputs.newOwnerContact) {
            output += `**New Owner Contact:**\n${inputs.newOwnerContact}\n`;
        }
        output += '\n---\n\n';

        // Risk Assessment
        output += `## Risk Assessment: ${risk.level.toUpperCase()}\n\n`;
        output += `${this.generateKeyFocus(inputs, risk.level)}\n\n`;

        // Priority Actions
        output += `### Priority Actions\n`;
        priorityActions.forEach((action, i) => {
            output += `${i + 1}. ${action.text}\n`;
        });
        output += '\n*Use your judgment and escalate to Louis Case or Charlie Eikenberg if the situation is unclear.*\n\n---\n\n';

        // Staged Checklist
        const stageNames = {
            stage1: 'Stage 1: Pre-Outreach',
            stage2: 'Stage 2: Outreach',
            stage3: 'Stage 3: Post-Outreach',
            stage4: 'Stage 4: Continuous'
        };

        for (const [stage, tasks] of Object.entries(checklist)) {
            if (tasks.length === 0) continue;
            output += `### ${stageNames[stage]}\n`;
            tasks.forEach(task => {
                const checkbox = task.completed ? '[x]' : '[ ]';
                let line = `- ${checkbox} ${task.text}`;
                if (task.note) {
                    line += ` *(${task.note})*`;
                }
                output += line + '\n';
            });
            output += '\n';
        }

        // Special Alerts
        if (alerts.length > 0) {
            output += `### Special Considerations\n`;
            alerts.forEach(alert => {
                output += `- **${alert.type.toUpperCase()}:** ${alert.text}\n`;
            });
        }

        return output;
    },

    /**
     * Format a single stage for Linear (markdown)
     */
    formatStageForLinear(stageName, stageTitle, tasks, inputs) {
        let output = '';

        // Include CHOW context at top of each stage
        output += `## ${stageTitle}\n`;
        output += `**CHOW:** ${inputs.oldOwnerName} → ${inputs.newOwnerName}\n`;
        output += `**Facilities:** ${inputs.affectedFacilities.split('\n').map(f => f.trim()).join(', ')}\n`;
        if (inputs.newFacilityNames) {
            output += `**New Names:** ${inputs.newFacilityNames.split('\n').map(f => f.trim()).join(', ')}\n`;
        }
        output += '\n---\n\n';

        output += `### Tasks\n`;
        tasks.forEach(task => {
            const checkbox = task.completed ? '[x]' : '[ ]';
            let line = `- ${checkbox} ${task.text}`;
            if (task.note) {
                line += ` *(${task.note})*`;
            }
            output += line + '\n';
        });

        return output;
    },

    /**
     * Generate markdown for each stage separately
     */
    generateStageMarkdown(inputs, checklist) {
        const stageNames = {
            stage1: 'Stage 1: Pre-Outreach',
            stage2: 'Stage 2: Outreach',
            stage3: 'Stage 3: Post-Outreach',
            stage4: 'Stage 4: Continuous'
        };

        const stageMarkdown = {};

        for (const [stage, tasks] of Object.entries(checklist)) {
            if (tasks.length > 0) {
                stageMarkdown[stage] = this.formatStageForLinear(stage, stageNames[stage], tasks, inputs);
            }
        }

        return stageMarkdown;
    },

    /**
     * Main entry point - process all inputs and return complete result
     */
    process(inputs) {
        const risk = this.calculateRisk(inputs);
        const scenario = this.generateScenarioDescription(inputs);
        const keyFocus = this.generateKeyFocus(inputs, risk.level);
        const priorityActions = this.generatePriorityActions(inputs, risk.level);
        const checklist = this.generateChecklist(inputs, risk.level);
        const alerts = this.generateAlerts(inputs);
        const linearMarkdown = this.formatForLinear(inputs, risk, checklist, priorityActions, alerts);
        const stageMarkdown = this.generateStageMarkdown(inputs, checklist);

        return {
            risk,
            scenario,
            keyFocus,
            priorityActions,
            checklist,
            alerts,
            linearMarkdown,
            stageMarkdown
        };
    }
};
