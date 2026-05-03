import { searchCustomersTool } from "./search-customers.js";
import { searchOpportunitiesTool } from "./search-opportunities.js";
import { getCustomerDetailsTool } from "./get-customer-details.js";
import { getOpportunityDetailsTool } from "./get-opportunity-details.js";
import { getPendingTasksTool } from "./get-pending-tasks.js";
import { getScheduledVisitsTool } from "./get-scheduled-visits.js";
import { createInteractionTool } from "./create-interaction.js";
import { createFollowUpTool } from "./create-followup.js";
import { createTaskTool } from "./create-task.js";

export const allTools = [
  searchCustomersTool,
  searchOpportunitiesTool,
  getCustomerDetailsTool,
  getOpportunityDetailsTool,
  getPendingTasksTool,
  getScheduledVisitsTool,
  createInteractionTool,
  createFollowUpTool,
  createTaskTool,
];