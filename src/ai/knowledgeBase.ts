import { Case } from '../types/case';
import { Evidence } from '../types/evidence';

/**
 * ============================================================================
 * CLASSICAL AI: KNOWLEDGE REPRESENTATION SYSTEM (SEMANTIC NETWORK / GRAPH)
 * ============================================================================
 * Explanation for Viva / Evaluation:
 * In Classical AI, a Knowledge Base represents facts about the domain as an
 * interconnected graph of Nodes (Entities) and Edges (Relationships).
 *
 * - Entities (Nodes): Represent concrete domain objects such as Cases, Evidence,
 *   IP Addresses, Devices, Persons, and Events.
 * - Relationships (Edges): Represent semantic associations connecting entities,
 *   such as "has_evidence", "uses_ip", "uses_device", or "shares_ip".
 *
 * This graph structure allows deterministic reasoning and traversal without
 * relying on black-box Machine Learning models.
 */

// Supported Entity types in the Forensics Knowledge Graph
export type EntityType =
  | 'Case'
  | 'Evidence'
  | 'Person'
  | 'Device'
  | 'IP'
  | 'Location'
  | 'Timestamp'
  | 'Event';

// Interface representing a single Entity (Node in the Knowledge Graph)
export interface Entity {
  id: string;
  type: EntityType;
  label: string;
  attributes: Record<string, any>;
}

// Interface representing a Relationship (Directed Edge between two Entities)
export interface Relationship {
  id: string;
  fromId: string;
  toId: string;
  type: string; // e.g. "associated_with", "supports", "uses_ip", "uses_device", "shares_ip", "shares_device"
  label?: string;
  attributes?: Record<string, any>;
}

// Structure exported by KnowledgeBase representing the full graph
export interface KnowledgeGraph {
  entities: Entity[];
  relationships: Relationship[];
}

/**
 * KnowledgeBase Class
 * Manages the entity-relationship graph in memory.
 */
export class KnowledgeBase {
  private entities: Map<string, Entity> = new Map();
  private relationships: Relationship[] = [];

  /**
   * Adds an entity (node) to the Knowledge Base.
   */
  public addEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  /**
   * Adds a relationship (edge) between two entities to the Knowledge Base.
   * Prevents duplicate relationship IDs.
   */
  public addRelationship(relationship: Relationship): void {
    if (!this.relationships.some((r) => r.id === relationship.id)) {
      this.relationships.push(relationship);
    }
  }

  /**
   * Retrieves an entity by its unique ID.
   */
  public getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /**
   * Retrieves all relationships where the given entity ID is either the source (fromId) or target (toId).
   */
  public getRelationshipsFor(entityId: string): Relationship[] {
    return this.relationships.filter(
      (rel) => rel.fromId === entityId || rel.toId === entityId
    );
  }

  /**
   * Exports the entire Knowledge Base graph as a plain JavaScript object.
   * Useful for UI rendering, serialization, or dev tools.
   */
  public exportGraph(): KnowledgeGraph {
    return {
      entities: Array.from(this.entities.values()),
      relationships: [...this.relationships],
    };
  }

  /**
   * Clears all entities and relationships.
   */
  public clear(): void {
    this.entities.clear();
    this.relationships = [];
  }
}

/**
 * Helper Function: buildKnowledgeBaseFromCase
 * Reads a case and its array of evidence items from Supabase, then converts them
 * into entities and semantic relationships in a KnowledgeBase instance.
 *
 * @param caseData The Case record
 * @param evidenceList Array of Evidence records belonging to the case
 * @returns Populated KnowledgeBase instance
 */
export function buildKnowledgeBaseFromCase(
  caseData: Case,
  evidenceList: Evidence[]
): KnowledgeBase {
  const kb = new KnowledgeBase();

  // 1. Add Case Entity (Central Node)
  kb.addEntity({
    id: caseData.id,
    type: 'Case',
    label: `${caseData.case_number}: ${caseData.title}`,
    attributes: {
      case_number: caseData.case_number,
      case_type: caseData.case_type,
      status: caseData.status,
      priority: caseData.priority,
      investigator: caseData.investigator,
    },
  });

  // Track created IP & Device entities to avoid duplicate nodes
  const createdIPs = new Set<string>();
  const createdDevices = new Set<string>();

  // 2. Iterate through each evidence item
  evidenceList.forEach((item) => {
    // Add Evidence Entity
    kb.addEntity({
      id: item.id,
      type: 'Evidence',
      label: item.title,
      attributes: {
        evidence_type: item.evidence_type,
        source: item.source,
        timestamp: item.timestamp,
        tags: item.tags,
      },
    });

    // Relationship: Case -> Has Evidence -> Evidence
    kb.addRelationship({
      id: `rel_case_${caseData.id}_ev_${item.id}`,
      fromId: caseData.id,
      toId: item.id,
      type: 'has_evidence',
      label: 'Has Evidence',
    });

    // Handle IP Address node if present
    if (item.ip_address && item.ip_address.trim() !== '') {
      const cleanIp = item.ip_address.trim();
      const ipEntityId = `entity_ip_${cleanIp}`;

      if (!createdIPs.has(cleanIp)) {
        kb.addEntity({
          id: ipEntityId,
          type: 'IP',
          label: cleanIp,
          attributes: { ip_address: cleanIp },
        });
        createdIPs.add(cleanIp);
      }

      kb.addRelationship({
        id: `rel_ev_${item.id}_ip_${ipEntityId}`,
        fromId: item.id,
        toId: ipEntityId,
        type: 'uses_ip',
        label: 'Uses IP Address',
      });
    }

    // Handle Device node if present
    if (item.device && item.device.trim() !== '') {
      const cleanDevice = item.device.trim();
      const deviceEntityId = `entity_device_${cleanDevice.toLowerCase()}`;

      if (!createdDevices.has(cleanDevice.toLowerCase())) {
        kb.addEntity({
          id: deviceEntityId,
          type: 'Device',
          label: cleanDevice,
          attributes: { device_name: cleanDevice },
        });
        createdDevices.add(cleanDevice.toLowerCase());
      }

      kb.addRelationship({
        id: `rel_ev_${item.id}_dev_${deviceEntityId}`,
        fromId: item.id,
        toId: deviceEntityId,
        type: 'uses_device',
        label: 'Uses Device',
      });
    }

    // Handle Related Event node if present
    if (item.related_event && item.related_event.trim() !== '') {
      const eventEntityId = `entity_event_${item.id}`;
      kb.addEntity({
        id: eventEntityId,
        type: 'Event',
        label: item.related_event,
        attributes: { event_description: item.related_event, timestamp: item.timestamp },
      });

      kb.addRelationship({
        id: `rel_ev_${item.id}_event_${eventEntityId}`,
        fromId: item.id,
        toId: eventEntityId,
        type: 'associated_with',
        label: 'Associated Event',
      });
    }
  });

  // 3. Establish Direct Relationships between Evidence pairs (Shared attributes)
  for (let i = 0; i < evidenceList.length; i++) {
    for (let j = i + 1; j < evidenceList.length; j++) {
      const evA = evidenceList[i];
      const evB = evidenceList[j];

      // Shared IP Address relationship
      if (
        evA.ip_address &&
        evB.ip_address &&
        evA.ip_address.trim() !== '' &&
        evA.ip_address.trim().toLowerCase() === evB.ip_address.trim().toLowerCase()
      ) {
        kb.addRelationship({
          id: `rel_shares_ip_${evA.id}_${evB.id}`,
          fromId: evA.id,
          toId: evB.id,
          type: 'shares_ip',
          label: 'Shares IP Address',
          attributes: { ip: evA.ip_address.trim() },
        });
      }

      // Shared Device relationship
      if (
        evA.device &&
        evB.device &&
        evA.device.trim() !== '' &&
        evA.device.trim().toLowerCase() === evB.device.trim().toLowerCase()
      ) {
        kb.addRelationship({
          id: `rel_shares_device_${evA.id}_${evB.id}`,
          fromId: evA.id,
          toId: evB.id,
          type: 'shares_device',
          label: 'Shares Device',
          attributes: { device: evA.device.trim() },
        });
      }
    }
  }

  return kb;
}
