      {/* Main Content Area - Conditionally show BacklogManager or regular board views */}
      {boardMode === 'manage-backlog' ? (
        <BacklogManager
          currentProject={currentProject}
          onExitBacklogManager={exitBacklogManager}
          onEdit={(feature) => setEditingFeature(feature)}
          onDelete={(featureId) => handleDeleteFeature(featureId)}
        />
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Bar Row */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <BoardSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              isCreatingSpec={isCreatingSpec}
              creatingSpecProjectPath={creatingSpecProjectPath ?? undefined}
              currentProjectPath={currentProject?.path}
            />

            {/* Board Background & Detail Level Controls */}
            <BoardControls
              isMounted={isMounted}
              onShowBoardBackground={() => setShowBoardBackgroundModal(true)}
              onShowCompletedModal={() => setShowCompletedModal(true)}
              completedCount={completedFeatures.length}
              kanbanCardDetailLevel={kanbanCardDetailLevel}
              onDetailLevelChange={setKanbanCardDetailLevel}
              boardViewMode={boardViewMode}
              onBoardViewModeChange={setBoardViewMode}
            />
          </div>

          {/* View Content - Kanban or Graph */}
          {boardViewMode === 'kanban' ? (
            <KanbanBoard
              sensors={sensors}
              collisionDetectionStrategy={collisionDetectionStrategy}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              activeFeature={activeFeature}
              getColumnFeatures={getColumnFeatures}
              backgroundImageStyle={backgroundImageStyle}
              backgroundSettings={backgroundSettings}
              onEdit={(feature) => setEditingFeature(feature)}
              onDelete={(featureId) => handleDeleteFeature(featureId)}
              onViewOutput={handleViewOutput}
              onVerify={handleVerifyFeature}
              onResume={handleResumeFeature}
              onForceStop={handleForceStopFeature}
              onManualVerify={handleManualVerify}
              onMoveBackToInProgress={handleMoveBackToInProgress}
              onFollowUp={handleOpenFollowUp}
              onComplete={handleCompleteFeature}
              onImplement={handleStartImplementation}
              onViewPlan={(feature) => setViewPlanFeature(feature)}
              onApprovePlan={handleOpenApprovalDialog}
              onSpawnTask={(feature) => {
                setSpawnParentFeature(feature);
                setShowAddDialog(true);
              }}
              featuresWithContext={featuresWithContext}
              runningAutoTasks={runningAutoTasks}
              onArchiveAllVerified={() => setShowArchiveAllVerifiedDialog(true)}
              pipelineConfig={
                currentProject?.path ? pipelineConfigByProject[currentProject.path] || null : null
              }
              onOpenPipelineSettings={() => setShowPipelineSettings(true)}
              isSelectionMode={isSelectionMode}
              selectedFeatureIds={selectedFeatureIds}
              onToggleFeatureSelection={toggleFeatureSelection}
              onToggleSelectionMode={toggleSelectionMode}
              onManageBacklog={enterBacklogManager}
              // restore main-branch functionality:
              onAddFeature={() => setShowAddDialog(true)}
              onAiSuggest={() => setShowPlanDialog(true)}
              isDragging={activeFeature !== null}
            />
          ) : (
            <GraphView
              features={hookFeatures}
              runningAutoTasks={runningAutoTasks}
              currentWorktreePath={currentWorktreePath}
              currentWorktreeBranch={currentWorktreeBranch}
              projectPath={currentProject?.path || null}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onEditFeature={(feature) => setEditingFeature(feature)}
              onViewOutput={handleViewOutput}
              onStartTask={handleStartImplementation}
              onStopTask={handleForceStopFeature}
              onResumeTask={handleResumeFeature}
              onUpdateFeature={updateFeature}
              onSpawnTask={(feature) => {
                setSpawnParentFeature(feature);
                setShowAddDialog(true);
              }}
              onDeleteTask={(feature) => handleDeleteFeature(feature.id)}
            />
          )}
        </div>
      )}
