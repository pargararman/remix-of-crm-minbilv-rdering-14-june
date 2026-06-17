import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Phone, XCircle, Share2, History } from "lucide-react";
import { LeadOverviewHeader } from "@/components/leads/lead-overview-header";
import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLeadDetail } from "@/lib/leads-detail.functions";
import { SmsChatPanel } from "@/components/leads/sms-chat";
import { SubmissionHistoryList } from "@/components/leads/submission-history-list";
import { LogCallModal } from "@/components/leads/log-call-modal";
import { StageHistoryModal } from "@/components/leads/stage-history-modal";
import { QuickValuationPanel } from "@/components/leads/quick-valuation-panel";
import { CompactAssessmentPanel } from "@/components/leads/compact-assessment-panel";
import { TagsRow } from "@/components/leads/tags-row";
import { NotesPanel } from "@/components/leads/notes-panel";
import { FilesPanel } from "@/components/leads/files-panel";
import { TasksPanel } from "@/components/leads/tasks-panel";
import { MarkLostModal } from "@/components/leads/mark-lost-modal";
import { PublishToDealersModal } from "@/components/leads/publish-to-dealers-modal";
import { ActiveDealChecklist } from "@/components/leads/active-deal-checklist";
import { StagePicker } from "@/components/leads/stage-picker";
import { OwnerControl } from "@/components/leads/owner-control";
import { dbStageToGroup } from "@/lib/stage-groups";
import { AuctionBidsPanel } from "@/components/leads/auction-bids-panel";

import { RouteError, RoutePending } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  head: () => ({ meta: [{ title: "Lead — Min Bil Värdering" }] }),
  component: LeadDetail,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});

function LeadDetail() {
  const { leadId } = Route.useParams();
  const fetchDetail = useServerFn(getLeadDetail);
  const q = useQuery({
    queryKey: ["lead-detail", leadId],
    queryFn: () => fetchDetail({ data: { leadId } }),
    // Låt route-boundaryn fånga upp fel istället för silent rendering.
    throwOnError: true,
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [stageHistOpen, setStageHistOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("anteckningar");

  if (q.isLoading || !q.data) return <RoutePending />;

  const { lead, vehicle, pricing, settings } = q.data;
  // Snabb värdering + bedömning visas alltid bredvid varandra.
  const isLost = lead.stage === "forlorad";

  return (
    <div className="space-y-4">
      {/* Sticky toppbar med tillbaka + actions */}
      <div className="sticky top-14 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-background/85 backdrop-blur border-b border-border flex items-center gap-2 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka</Link>
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setChatOpen(true)}>
          <MessageSquare className="h-4 w-4 mr-1" /> SMS
        </Button>
        <Button size="sm" variant="outline" onClick={() => setCallOpen(true)}>
          <Phone className="h-4 w-4 mr-1" /> Ring
        </Button>
        {!isLost && (
          <Button size="sm" variant="outline" onClick={() => setPublishOpen(true)}>
            <Share2 className="h-4 w-4 mr-1" /> Publicera
          </Button>
        )}
        {!isLost && (
          <Button size="sm" variant="ghost" onClick={() => setLostOpen(true)} className="text-muted-foreground hover:text-destructive">
            <XCircle className="h-4 w-4 mr-1" /> Förlorad
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setStageHistOpen(true)} title="Visa stegförflyttningar">
          <History className="h-4 w-4" />
        </Button>
      </div>

      {/* Manuell steg + ägar-kontroll */}
      <div className="flex flex-wrap items-center gap-3 -mt-1">
        <StagePicker
          leadId={lead.id}
          currentStage={lead.stage as any}
          archived={!!(lead as any).archived_at}
        />
        <OwnerControl
          leadId={lead.id}
          ownerId={(lead as any).owner_id ?? null}
          ownerName={q.data.ownerName ?? null}
        />
      </div>

      {/* Återkomst-banner när kunden lämnat förfrågan flera gånger */}
      {((lead as any).submission_count ?? 1) > 1 && (
        <div className="mb-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">
            Återkommande kund — har lämnat förfrågan {(lead as any).submission_count} gånger
          </div>
          {(lead as any).last_submission_at && (
            <div className="text-xs text-amber-800">
              Senast: {new Date((lead as any).last_submission_at).toLocaleString("sv-SE")}
            </div>
          )}
          <SubmissionHistoryList leadId={lead.id} />
        </div>
      )}

      {/* Overview alltid överst */}
      <LeadOverviewHeader lead={lead} vehicle={vehicle} pricing={pricing} settings={settings} />

      <TagsRow leadId={lead.id} />

      <ActiveDealChecklist
        leadId={lead.id}
        isActiveDeal={dbStageToGroup(lead.stage as any, !!(lead as any).archived_at) === "aktiv_affar"}
      />


      {/* Kompakt arbetsyta: pris vänster, bedömning höger */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <QuickValuationPanel
          leadId={lead.id}
          regnr={lead.registration_number}
          vehicle={vehicle}
          carInfoPattern={settings?.car_info_url_pattern}
          blocketPattern={settings?.blocket_url_pattern}
          biluppgifterPattern={settings?.biluppgifter_url_pattern}
          valuationFrom={pricing?.valuation_from}
          valuationTo={pricing?.valuation_to}
          onSendOffer={() => setChatOpen(true)}
        />
        <CompactAssessmentPanel leadId={lead.id} />
      </div>

      {(lead.stage === "matchad" || lead.stage === "bud_mottaget") && (
        <AuctionBidsPanel leadId={lead.id} stage={lead.stage as string} />
      )}


      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="anteckningar">Anteckningar</TabsTrigger>
          <TabsTrigger value="filer">Filer</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>


        <TabsContent value="anteckningar" className="pt-4">
          <NotesPanel leadId={lead.id} />
        </TabsContent>


        <TabsContent value="filer" className="pt-4">
          <FilesPanel leadId={lead.id} />
        </TabsContent>

        <TabsContent value="tasks" className="pt-4">
          <TasksPanel leadId={lead.id} />
        </TabsContent>

      </Tabs>

      <SmsChatPanel
        leadId={lead.id}
        customerName={lead.customer_name}
        phone={lead.phone}
        quietStart={settings?.sms_quiet_hours_start}
        quietEnd={settings?.sms_quiet_hours_end}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
      <LogCallModal
        leadId={lead.id}
        phone={lead.phone}
        open={callOpen}
        onOpenChange={setCallOpen}
        onOpenChatWithMissedCall={() => setChatOpen(true)}
      />
      <StageHistoryModal leadId={lead.id} open={stageHistOpen} onOpenChange={setStageHistOpen} />
      <MarkLostModal leadId={lead.id} open={lostOpen} onOpenChange={setLostOpen} />
      <PublishToDealersModal leadId={lead.id} open={publishOpen} onOpenChange={setPublishOpen} />
    </div>
  );
}

