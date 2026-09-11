import {BUILDING_INFO} from '../constants';
import {BuildingType} from '../types';
/** Display names can evolve without changing persisted building identities. */
export const FACILITY_INFO={...BUILDING_INFO,[BuildingType.TRAINING_PITCH]:{...BUILDING_INFO[BuildingType.TRAINING_PITCH],name:'Weight Room',description:'Work out with your teammates and grow stronger.'}};
