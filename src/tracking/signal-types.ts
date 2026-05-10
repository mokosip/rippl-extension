export type SignalDelta = {
  interaction_count?: number;
  copy_events?: number;
  paste_events?: number;
  activityTs?: number;
};

export type InteractionUpdateMessage = {
  type: "interaction-update";
  counts: SignalDelta;
};
